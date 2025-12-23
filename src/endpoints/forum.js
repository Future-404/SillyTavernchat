import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import sanitize from 'sanitize-filename';
import Article from '../models/Article.js';
import Comment from '../models/Comment.js';

// 论坛数据存储目录 (仅用于图片)
const FORUM_DATA_DIR = path.join(globalThis.DATA_ROOT, 'forum_data');
const IMAGES_DIR = path.join(FORUM_DATA_DIR, 'images');

// 确保目录存在
if (!fs.existsSync(FORUM_DATA_DIR)) fs.mkdirSync(FORUM_DATA_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

export const router = express.Router();

/**
 * 生成ID
 * @returns {string} ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 将扁平评论列表转换为树状结构
 * @param {Array} comments 扁平评论数组
 * @returns {Array} 树状评论数组
 */
function buildCommentTree(comments) {
    const map = {};
    const roots = [];
    
    // 转换 mongoose 文档为普通对象
    const plainComments = comments.map(c => c.toObject ? c.toObject() : c);

    plainComments.forEach(c => {
        c.replies = [];
        map[c.id] = c;
    });

    plainComments.forEach(c => {
        if (c.parent_id && map[c.parent_id]) {
            map[c.parent_id].replies.push(c);
        } else {
            roots.push(c);
        }
    });

    // 排序
    const sortReplies = (items) => {
        items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        items.forEach(item => {
            if (item.replies.length > 0) sortReplies(item.replies);
        });
    };
    
    sortReplies(roots);
    return roots;
}

// 获取所有文章 (支持搜索和分页)
router.get('/articles', async function (request, response) {
    try {
        const { q, category, author, limit, page } = request.query;
        const query = {};

        if (q) {
            const searchRegex = new RegExp(q, 'i');
            query.$or = [
                { title: searchRegex },
                { content: searchRegex },
                { tags: searchRegex }
            ];
        }

        if (category) query.category = category;
        if (author) query['author.handle'] = author;

        // 分页逻辑
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 100;
        const skip = (pageNum - 1) * limitNum;

        const articles = await Article.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        response.json(articles);
    } catch (error) {
        console.error('Error getting articles:', error);
        response.status(500).json({ error: 'Failed to get articles' });
    }
});

// 获取文章详情
router.get('/articles/:articleId', async function (request, response) {
    try {
        const { articleId } = request.params;
        
        // 增加浏览量
        const article = await Article.findOneAndUpdate(
            { id: articleId },
            { $inc: { views: 1 } },
            { new: true }
        ).lean();

        if (!article) {
            return response.status(404).json({ error: 'Article not found' });
        }

        // 获取评论
        const comments = await Comment.find({ target_id: articleId, target_type: 'article' }).lean();
        article.comments = buildCommentTree(comments);

        // 检查当前用户是否已点赞
        if (request.user && article.liked_by) {
            article.user_liked = article.liked_by.includes(request.user.profile.handle);
        } else {
            article.user_liked = false;
        }

        response.json(article);
    } catch (error) {
        console.error('Error getting article:', error);
        response.status(500).json({ error: 'Failed to get article' });
    }
});

// 创建新文章
router.post('/articles', async function (request, response) {
    try {
        const { title, content, category, tags } = request.body;

        if (!title || !content) {
            return response.status(400).json({ error: 'Title and content are required' });
        }

        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        const newArticle = new Article({
            id: generateId(),
            title: title.trim(),
            content: content.trim(),
            category: category || 'discussion',
            tags: tags || [],
            author: {
                handle: request.user.profile.handle,
                name: request.user.profile.name,
            },
            created_at: new Date(),
            updated_at: new Date(),
            views: 0,
            likes: 0,
            comments_count: 0
        });

        await newArticle.save();
        console.info(`Article "${newArticle.title}" created by ${newArticle.author.handle}`);
        response.json(newArticle);
    } catch (error) {
        console.error('Error creating article:', error);
        response.status(500).json({ error: 'Failed to create article' });
    }
});

// 更新文章
router.put('/articles/:articleId', async function (request, response) {
    try {
        const { articleId } = request.params;
        const { title, content, category, tags } = request.body;

        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        const article = await Article.findOne({ id: articleId });
        if (!article) {
            return response.status(404).json({ error: 'Article not found' });
        }

        const isAuthor = article.author.handle === request.user.profile.handle;
        const isAdmin = request.user.profile.admin;

        if (!isAuthor && !isAdmin) {
            return response.status(403).json({ error: 'Permission denied' });
        }

        if (title) article.title = title.trim();
        if (content) article.content = content.trim();
        if (category) article.category = category;
        if (tags) article.tags = tags;
        // Mongoose timestamps will handle updated_at

        await article.save();
        console.info(`Article "${article.title}" updated by ${request.user.profile.handle}`);
        response.json(article);
    } catch (error) {
        console.error('Error updating article:', error);
        response.status(500).json({ error: 'Failed to update article' });
    }
});

// 删除文章
router.delete('/articles/:articleId', async function (request, response) {
    try {
        const { articleId } = request.params;

        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        const article = await Article.findOne({ id: articleId });
        if (!article) {
            return response.status(404).json({ error: 'Article not found' });
        }

        const isAuthor = article.author.handle === request.user.profile.handle;
        const isAdmin = request.user.profile.admin;

        if (!isAuthor && !isAdmin) {
            return response.status(403).json({ error: 'Permission denied' });
        }

        // 删除文章
        await Article.deleteOne({ id: articleId });
        
        // 删除关联评论
        await Comment.deleteMany({ target_id: articleId, target_type: 'article' });

        console.info(`Article "${article.title}" deleted by ${request.user.profile.handle}`);
        response.json({ success: true });
    } catch (error) {
        console.error('Error deleting article:', error);
        response.status(500).json({ error: 'Failed to delete article' });
    }
});

// 添加评论 (文章)
router.post('/articles/:articleId/comments', async function (request, response) {
    try {
        const { articleId } = request.params;
        const { content, parent_id } = request.body;

        if (!content) {
            return response.status(400).json({ error: 'Comment content is required' });
        }

        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        const article = await Article.findOne({ id: articleId });
        if (!article) {
            return response.status(404).json({ error: 'Article not found' });
        }

        const newComment = new Comment({
            id: generateId(),
            target_id: articleId,
            target_type: 'article',
            parent_id: parent_id || null,
            content: content.trim(),
            author: {
                handle: request.user.profile.handle,
                name: request.user.profile.name,
            },
            created_at: new Date(),
            likes: 0
        });

        await newComment.save();

        // 更新文章评论数
        await Article.updateOne({ id: articleId }, { $inc: { comments_count: 1 } });

        console.info(`Comment added to article "${article.title}" by ${newComment.author.handle}`);
        response.json(newComment);
    } catch (error) {
        console.error('Error adding comment:', error);
        response.status(500).json({ error: 'Failed to add comment' });
    }
});

// 删除评论 (通用)
router.delete('/comments/:commentId', async function (request, response) {
    try {
        const { commentId } = request.params;

        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        const comment = await Comment.findOne({ id: commentId });
        if (!comment) {
            return response.status(404).json({ error: 'Comment not found' });
        }

        const isAuthor = comment.author.handle === request.user.profile.handle;
        const isAdmin = request.user.profile.admin;

        if (!isAuthor && !isAdmin) {
            return response.status(403).json({ error: 'Permission denied' });
        }

        // 递归查找并删除所有子评论
        // 简单方法：先找出所有子孙ID，然后批量删除
        const commentsToDelete = [comment.id];
        
        async function findChildren(parentId) {
            const children = await Comment.find({ parent_id: parentId });
            for (const child of children) {
                commentsToDelete.push(child.id);
                await findChildren(child.id);
            }
        }
        
        await findChildren(commentId);
        
        // 执行删除
        await Comment.deleteMany({ id: { $in: commentsToDelete } });

        // 更新文章/角色的评论数 (如果是文章)
        if (comment.target_type === 'article') {
            await Article.updateOne(
                { id: comment.target_id },
                { $inc: { comments_count: -commentsToDelete.length } }
            );
        }
        // 如果是角色评论，且角色模型支持评论计数，也可以在这里更新

        console.info(`Comment and replies deleted by ${request.user.profile.handle}. Count: ${commentsToDelete.length}`);
        response.json({ success: true, deletedCount: commentsToDelete.length });
    } catch (error) {
        console.error('Error deleting comment:', error);
        response.status(500).json({ error: 'Failed to delete comment' });
    }
});

// 点赞文章
router.post('/articles/:articleId/like', async function (request, response) {
    try {
        const { articleId } = request.params;

        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        const userHandle = request.user.profile.handle;
        const article = await Article.findOne({ id: articleId });

        if (!article) return response.status(404).json({ error: 'Article not found' });

        const hasLiked = article.liked_by.includes(userHandle);
        let updateQuery;

        if (hasLiked) {
            updateQuery = { $pull: { liked_by: userHandle }, $inc: { likes: -1 } };
        } else {
            updateQuery = { $push: { liked_by: userHandle }, $inc: { likes: 1 } };
        }

        const updatedArticle = await Article.findOneAndUpdate(
            { id: articleId },
            updateQuery,
            { new: true }
        );

        response.json({
            success: true,
            likes: updatedArticle.likes,
            liked: !hasLiked,
            message: hasLiked ? '取消点赞' : '点赞成功',
        });
    } catch (error) {
        console.error('Error toggling like:', error);
        response.status(500).json({ error: 'Failed to toggle like' });
    }
});

// 获取分类 (保持不变)
router.get('/categories', async function (request, response) {
    try {
        const categories = [
            { id: 'tutorial', name: '教程', description: '使用教程和指南' },
            { id: 'discussion', name: '讨论', description: '一般讨论和交流' },
            { id: 'announcement', name: '公告', description: '官方公告和通知' },
            { id: 'question', name: '问答', description: '问题和解答' },
            { id: 'showcase', name: '展示', description: '作品展示和分享' },
        ];
        response.json(categories);
    } catch (error) {
        response.status(500).json({ error: 'Failed to get categories' });
    }
});

// 搜索 (复用 GET /articles)
router.get('/search', async function (request, response) {
    const { q, category, author } = request.query;
    const queryString = new URLSearchParams({ q: q || '', category: category || '', author: author || '' }).toString();
    response.redirect(`/api/forum/articles?${queryString}`);
});

// 图片上传 (保持不变，存本地文件)
router.post('/upload-image', async function (request, response) {
    try {
        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }
        if (!request.file) {
            return response.status(400).json({ error: 'No image file uploaded' });
        }

        const uploadedFile = request.file;
        const fileExtension = path.extname(uploadedFile.originalname);
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${fileExtension}`;
        const filePath = path.join(IMAGES_DIR, fileName);

        fs.renameSync(uploadedFile.path, filePath);

        const imageUrl = `/api/forum/images/${fileName}`;
        response.json({ success: true, url: imageUrl, filename: fileName });
    } catch (error) {
        console.error('Error uploading image:', error);
        if (request.file && fs.existsSync(request.file.path)) fs.unlinkSync(request.file.path);
        response.status(500).json({ error: 'Failed to upload image' });
    }
});

// 提供图片文件 (保持不变)
router.get('/images/:filename', async function (request, response) {
    try {
        const { filename } = request.params;
        const sanitizedFilename = sanitize(filename);
        const imagePath = path.resolve(IMAGES_DIR, sanitizedFilename);

        if (!fs.existsSync(imagePath)) {
            return response.status(404).json({ error: 'Image not found' });
        }

        response.setHeader('Cache-Control', 'public, max-age=31536000');
        response.sendFile(imagePath);
    } catch (error) {
        response.status(500).json({ error: 'Failed to serve image' });
    }
});