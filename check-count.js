import fs from 'node:fs';
import mongoose from 'mongoose';
import Character from './src/models/Character.js';

async function check() {
    // 强制使用 localhost 用于宿主机测试
    const uri = 'mongodb://mongo_dnX3cC:mongo_5N4yhy@localhost:27017/sillytavern?authSource=admin';

    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        console.log('Connected to DB via localhost.');

        const count = await Character.countDocuments();
        console.log(`Total Characters in DB: ${count}`);

        const sample = await Character.findOne();
        if (sample) {
            console.log('Sample character:', sample.name);
            console.log('Sample Uploader:', sample.uploader);
        } else {
            console.log('Database is empty.');
        }

        await mongoose.disconnect();
    } catch (e) {
        console.error('Connection failed:', e.message);
    }
}

check().catch(console.error);