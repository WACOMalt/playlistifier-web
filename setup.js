#!/usr/bin/env node

const setupManager = require('./server/utils/setup');

async function main() {
    console.log('🎵 Playlistifier Web Setup');
    console.log('==========================');
    console.log('This will download the required tools (yt-dlp and ffmpeg)');
    console.log('');
    
    try {
        const success = await setupManager.setup();
        
        if (success) {
            console.log('');
            console.log('✅ Setup completed successfully!');
            console.log('You can now run: npm run dev');
        } else {
            console.log('');
            console.log('❌ Setup failed. Please check the errors above.');
            console.log('You may need to install yt-dlp and ffmpeg manually.');
            process.exit(1);
        }
    } catch (error) {
        console.error('Setup error:', error.message);
        process.exit(1);
    }
}

main();
