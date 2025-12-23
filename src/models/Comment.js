import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    target_id: {
        type: String,
        required: true,
        index: true // 索引目标ID，加速查找文章/角色的评论
    },
    target_type: {
        type: String,
        enum: ['article', 'character'],
        required: true,
        index: true
    },
    parent_id: {
        type: String,
        default: null,
        index: true
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    author: {
        handle: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        }
    },
    likes: {
        type: Number,
        default: 0
    },
    liked_by: {
        type: [String], // 用户 handle 列表
        default: []
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'comments'
});

const Comment = mongoose.model('Comment', commentSchema);

export default Comment;
