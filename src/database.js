import mongoose from 'mongoose';
import { color } from './util.js';

let isConnected = false;

export async function connectDatabase() {
    if (isConnected) {
        return;
    }

    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sillytavern';

    try {
        await mongoose.connect(uri);
        isConnected = true;
        console.log(color.green('✓ Connected to MongoDB'));
    } catch (error) {
        console.error(color.red('✗ Failed to connect to MongoDB:'), error.message);
        // 在云服务环境中，数据库连接失败可能是致命的，但在开发环境中，我们可能希望它继续运行以便调试其他部分
        // 这里我们选择记录错误但不退出进程，除非这是必须的
    }
}

export async function disconnectDatabase() {
    if (!isConnected) {
        return;
    }

    try {
        await mongoose.disconnect();
        isConnected = false;
        console.log(color.green('✓ Disconnected from MongoDB'));
    } catch (error) {
        console.error(color.red('✗ Error disconnecting from MongoDB:'), error.message);
    }
}
