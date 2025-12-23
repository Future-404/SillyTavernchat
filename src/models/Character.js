import mongoose from 'mongoose';

const characterSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        index: true // 为名称添加索引
    },
    description: {
        type: String,
        default: ''
    },
    tags: {
        type: [String],
        default: [],
        index: true // 为标签添加索引，这对于标签搜索至关重要
    },
    uploader: {
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
    uploaded_at: {
        type: Date,
        default: Date.now,
        index: -1 // 按时间倒序索引
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    character_data: {
        type: mongoose.Schema.Types.Mixed, // 存储任意结构的 JSON
        default: {}
    },
    avatar: {
        type: String, // 头像文件名（PNG）
        required: true
    },
    downloads: {
        type: Number,
        default: 0
    },
    views: {
        type: Number,
        default: 0
    },
    likes: {
        type: Number,
        default: 0
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'public_characters'
});

// 复合文本索引，用于全文搜索
characterSchema.index({ name: 'text', description: 'text', tags: 'text' });

const Character = mongoose.model('Character', characterSchema);

export default Character;
