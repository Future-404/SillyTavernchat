import mongoose from 'mongoose';

const articleSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    content: {
        type: String,
        required: true
    },
    category: {
        type: String,
        default: 'discussion',
        index: true
    },
    tags: {
        type: [String],
        default: [],
        index: true
    },
    author: {
        handle: {
            type: String,
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true
        }
    },
    views: {
        type: Number,
        default: 0
    },
    likes: {
        type: Number,
        default: 0
    },
    liked_by: {
        type: [String],
        default: []
    },
    comments_count: {
        type: Number,
        default: 0
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'articles'
});

// 复合文本索引
articleSchema.index({ title: 'text', content: 'text', tags: 'text' });

const Article = mongoose.model('Article', articleSchema);

export default Article;
