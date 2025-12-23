import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import sanitize from 'sanitize-filename';
import { humanizedISO8601DateTime } from '../util.js';
import Character from '../models/Character.js';
import Comment from '../models/Comment.js';

// 公用角色卡存储目录（仅用于存储 PNG 文件）
const PUBLIC_CHARACTERS_DIR = path.join(globalThis.DATA_ROOT, 'public_characters');

// 确保目录存在
if (!fs.existsSync(PUBLIC_CHARACTERS_DIR)) {
    fs.mkdirSync(PUBLIC_CHARACTERS_DIR, { recursive: true });
}

export const router = express.Router();

/**
 * 生成角色卡ID
 * @returns {string} 角色卡ID
 */
function generateCharacterId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

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

// 获取所有公用角色卡 (支持分页和搜索)
router.get('/', async function (request, response) {
    try {
        const page = parseInt(request.query.page) || 1;
        const limit = parseInt(request.query.limit) || 1000;
        const skip = (page - 1) * limit;

        const query = {};
        if (request.query.q) {
            const regex = new RegExp(request.query.q, 'i');
            query.$or = [
                { name: regex },
                { description: regex },
                { tags: regex }
            ];
        }

        if (request.query.uploader) {
            query['uploader.handle'] = request.query.uploader;
        }

        if (request.query.tags) {
            const tags = Array.isArray(request.query.tags) ? request.query.tags : [request.query.tags];
            query.tags = { $all: tags };
        }

        const characters = await Character.find(query)
            .select('-character_data')
            .sort({ uploaded_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        response.json(characters);
    } catch (error) {
        console.error('Error getting public characters:', error);
        response.status(500).json({ error: 'Failed to get public characters' });
    }
});

// 获取角色卡详情
router.get('/:characterId', async function (request, response) {
    try {
        const { characterId } = request.params;
        
        const character = await Character.findOneAndUpdate(
            { id: characterId },
            { $inc: { views: 1 } },
            { new: true }
        ).lean();

        if (!character) {
            return response.status(404).json({ error: 'Character not found' });
        }

        response.json(character);
    } catch (error) {
        console.error('Error getting public character:', error);
        response.status(500).json({ error: 'Failed to get character' });
    }
});

// 文件类型验证中间件
function validateFileType(req, res, next) {
    const file = req.file;

    if (!file) {
        return res.status(400).json({ error: '请选择角色卡文件' });
    }

    const allowedMimeTypes = [
        'image/png', 
        'application/json', 
        'text/yaml', 
        'text/x-yaml', 
        'application/x-yaml'
    ];
    
    const originalName = (file.originalname || '').toLowerCase();
    const allowedExtensions = ['.png', '.json', '.yaml', '.yml'];
    const hasValidExtension = allowedExtensions.some(ext => originalName.endsWith(ext));

    const isValidType = allowedMimeTypes.includes(file.mimetype) || hasValidExtension;

    if (!isValidType) {
        return res.status(400).json({ error: '不支持的文件类型: 仅支持 PNG, JSON, YAML' });
    }

    if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: '文件大小不能超过10MB' });
    }

    next();
}

// 上传公用角色卡
router.post('/upload', validateFileType, async function (request, response) {
    try {
        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        const { name, description, tags } = request.body;
        const file = request.file;

        if (!file) {
            return response.status(400).json({ error: '请选择角色卡文件' });
        }

        let fileType = null;
        const mime = (file.mimetype || '').toLowerCase();
        const ext = path.extname(file.originalname || '').toLowerCase();

        if (mime === 'image/png' || ext === '.png') {
            fileType = 'png';
        } else if (mime.includes('json') || ext === '.json') {
            fileType = 'json';
        } else if (mime.includes('yaml') || ext === '.yaml' || ext === '.yml') {
            fileType = 'yaml';
        }

        if (!fileType) {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            return response.status(400).json({ error: '无法识别的文件类型: 仅支持 PNG, JSON, YAML' });
        }

        if (!name) {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            return response.status(400).json({ error: '请输入角色名称' });
        }

        let characterData = {};
        let avatarPath = null;
        const characterId = generateCharacterId();

        try {
            if (fileType === 'json') {
                const fileContent = fs.readFileSync(file.path, 'utf8');
                characterData = JSON.parse(fileContent);
            } else if (fileType === 'yaml') {
                const yamlModule = await import('js-yaml');
                const yaml = yamlModule.default || yamlModule;
                const fileContent = fs.readFileSync(file.path, 'utf8');
                characterData = yaml.load(fileContent) || {};
            } else if (fileType === 'png') {
                const characterCardParser = await import('../character-card-parser.js');
                const parse = characterCardParser.parse;
                const parsedData = await parse(file.path, 'png');
                try {
                    characterData = JSON.parse(parsedData);
                } catch (e) {
                    throw new Error('PNG内嵌角色数据不是有效的JSON');
                }
            }

            const fileName = `${characterId}.${fileType}`;
            const finalPath = path.join(PUBLIC_CHARACTERS_DIR, fileName);

            fs.renameSync(file.path, finalPath);
            avatarPath = fileName;

        } catch (parseError) {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            console.error('Error parsing character file:', parseError);
            return response.status(400).json({ error: '角色卡文件格式错误或损坏' });
        }

        let parsedTags = [];
        if (tags) {
            try {
                parsedTags = JSON.parse(tags);
            } catch (e) {
                parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
            }
        }

        const newCharacter = new Character({
            id: characterId,
            name: name.trim(),
            description: description?.trim() || '',
            tags: parsedTags,
            uploader: {
                handle: request.user.profile.handle,
                name: request.user.profile.name,
            },
            uploaded_at: new Date(),
            created_at: new Date(),
            character_data: characterData,
            avatar: avatarPath,
            downloads: 0
        });

        await newCharacter.save();
        console.info(`Public character "${newCharacter.name}" uploaded by ${newCharacter.uploader.handle}`);
        response.json(newCharacter);

    } catch (error) {
        console.error('Error uploading public character:', error);
        response.status(500).json({ error: 'Failed to upload character' });
    }
});

// 删除公用角色卡
router.delete('/:characterId', async function (request, response) {
    try {
        const { characterId } = request.params;

        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        const character = await Character.findOne({ id: characterId });
        if (!character) {
            return response.status(404).json({ error: 'Character not found' });
        }

        const isUploader = character.uploader.handle === request.user.profile.handle;
        const isAdmin = request.user.profile.admin;

        if (!isUploader && !isAdmin) {
            return response.status(403).json({ error: 'Permission denied' });
        }

        await Character.deleteOne({ id: characterId });
        
        // 删除关联评论
        await Comment.deleteMany({ target_id: characterId, target_type: 'character' });

        if (character.avatar) {
            const filePath = path.join(PUBLIC_CHARACTERS_DIR, character.avatar);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        console.info(`Public character "${character.name}" deleted by ${request.user.profile.handle}`);
        response.json({ success: true });
    } catch (error) {
        console.error('Error deleting public character:', error);
        response.status(500).json({ error: 'Failed to delete character' });
    }
});

// 搜索 (复用 GET /)
router.get('/search', async function (request, response) {
    const queryString = new URLSearchParams(request.query).toString();
    response.redirect(`/api/public-characters/?${queryString}`);
});

// 下载角色卡
router.post('/:characterId/download', async function (request, response) {
    try {
        const { characterId } = request.params;
        
        const character = await Character.findOneAndUpdate(
            { id: characterId },
            { $inc: { downloads: 1 } },
            { new: true }
        ).lean();

        if (!character) {
            return response.status(404).json({ error: 'Character not found' });
        }

        response.json({
            success: true,
            character_data: character.character_data,
        });
    } catch (error) {
        console.error('Error downloading public character:', error);
        response.status(500).json({ error: 'Failed to download character' });
    }
});

// 获取头像
router.get('/avatar/:filename', async function (request, response) {
    try {
        const { filename } = request.params;
        const decodedFilename = decodeURIComponent(filename);
        const avatarPath = path.join(PUBLIC_CHARACTERS_DIR, decodedFilename);

        if (!fs.existsSync(avatarPath)) {
            return response.status(404).json({ error: 'Avatar not found' });
        }

        const ext = path.extname(decodedFilename).toLowerCase();
        let contentType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.gif') contentType = 'image/gif';
        else if (ext === '.webp') contentType = 'image/webp';

        response.setHeader('Content-Type', contentType);
        response.setHeader('Cache-Control', 'public, max-age=31536000'); // 1年缓存

        const avatarBuffer = fs.readFileSync(avatarPath);
        response.send(avatarBuffer);
    } catch (error) {
        console.error('Error serving avatar:', error);
        response.status(500).json({ error: 'Failed to serve avatar' });
    }
});

// 导入角色卡
router.post('/:characterId/import', async function (request, response) {
    try {
        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        const { characterId } = request.params;
        const character = await Character.findOneAndUpdate(
            { id: characterId },
            { $inc: { downloads: 1 } },
            { new: true }
        ).lean();

        if (!character) {
            return response.status(404).json({ error: 'Character not found' });
        }

        const importResult = await importCharacterToUserLibrary(character, request.user);

        if (importResult.success) {
            response.json({
                success: true,
                message: '角色卡导入成功',
                file_name: importResult.fileName,
            });
        } else {
            response.status(500).json({ error: importResult.error || '导入失败' });
        }
    } catch (error) {
        console.error('Error importing character:', error);
        response.status(500).json({ error: 'Failed to import character' });
    }
});

async function importCharacterToUserLibrary(character, user) {
    try {
        const { getUserDirectories } = await import('../users.js');
        const userDirs = getUserDirectories(user.profile.handle);
        
        if (!fs.existsSync(userDirs.characters)) {
            fs.mkdirSync(userDirs.characters, { recursive: true });
        }

        let characterFilePath = null;
        if (character.avatar && character.avatar !== 'img/ai4.png') {
            characterFilePath = path.join(PUBLIC_CHARACTERS_DIR, character.avatar);
        }

        if (!characterFilePath || !fs.existsSync(characterFilePath)) {
            throw new Error('角色卡源文件缺失');
        }

        const extension = path.extname(characterFilePath).toLowerCase().substring(1);
        let avatarBuffer = fs.readFileSync(characterFilePath);
        
        const timestamp = Date.now();
        const baseFileName = sanitize(character.name || 'character');
        const sanitizedFileName = sanitize(`${baseFileName}_${timestamp}`);

        const characterCardParser = await import('../character-card-parser.js');
        const { write } = characterCardParser;
        const jsonData = character.character_data;
        
        let finalBuffer = avatarBuffer;
        let finalExt = extension;

        if (extension === 'png') {
            finalBuffer = write(avatarBuffer, JSON.stringify(jsonData));
        } else {
            finalExt = 'json';
            finalBuffer = Buffer.from(JSON.stringify(jsonData, null, 4));
        }

        const outPath = path.join(userDirs.characters, `${sanitizedFileName}.${finalExt}`);
        const { sync: writeFileAtomicSync } = await import('write-file-atomic');
        writeFileAtomicSync(outPath, finalBuffer);

        const chatsPath = path.join(userDirs.chats, sanitizedFileName);
        if (!fs.existsSync(chatsPath)) {
            fs.mkdirSync(chatsPath, { recursive: true });
        }

        return { success: true, fileName: sanitizedFileName };
    } catch (error) {
        console.error('Error importing character to user library:', error);
        return { success: false, error: error.message };
    }
}

// === 评论相关接口 (重构后) ===

// 获取评论
router.get('/:characterId/comments', async function (request, response) {
    try {
        const { characterId } = request.params;
        const comments = await Comment.find({ 
            target_id: characterId, 
            target_type: 'character' 
        }).lean();
        
        // 返回树状结构
        response.json(buildCommentTree(comments));
    } catch (error) {
        console.error('Error getting comments:', error);
        response.status(500).json({ error: 'Failed to get comments' });
    }
});

// 发表评论
router.post('/:characterId/comments', async function (request, response) {
    try {
        const { characterId } = request.params;
        const { content, parentId } = request.body; // 注意前端传的是 parentId 还是 parent_id

        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        if (!content) {
            return response.status(400).json({ error: 'Content is required' });
        }

        const character = await Character.findOne({ id: characterId });
        if (!character) {
            return response.status(404).json({ error: 'Character not found' });
        }

        const newComment = new Comment({
            id: generateId(),
            target_id: characterId,
            target_type: 'character',
            parent_id: parentId || null,
            content: content.trim(),
            author: {
                handle: request.user.profile.handle,
                name: request.user.profile.name,
            },
            created_at: new Date(),
            likes: 0
        });

        await newComment.save();
        console.info(`Comment added to character "${character.name}" by ${newComment.author.handle}`);
        response.json(newComment);
    } catch (error) {
        console.error('Error adding comment:', error);
        response.status(500).json({ error: 'Failed to add comment' });
    }
});

// 删除评论
router.delete('/:characterId/comments/:commentId', async function (request, response) {
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

        // 递归删除逻辑
        const commentsToDelete = [comment.id];
        
        async function findChildren(parentId) {
            const children = await Comment.find({ parent_id: parentId });
            for (const child of children) {
                commentsToDelete.push(child.id);
                await findChildren(child.id);
            }
        }
        
        await findChildren(commentId);
        await Comment.deleteMany({ id: { $in: commentsToDelete } });

        console.info(`Comment ${commentId} deleted by ${request.user.profile.handle}`);
        response.json({ success: true });
    } catch (error) {
        console.error('Error deleting comment:', error);
        response.status(500).json({ error: 'Failed to delete comment' });
    }
});
