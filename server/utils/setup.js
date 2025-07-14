const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const yauzl = require('yauzl');

class SetupManager {
    constructor() {
        this.toolsDir = path.join(process.cwd(), 'tools');
        this.ytDlpPath = path.join(this.toolsDir, 'yt-dlp.exe');
        this.ffmpegPath = path.join(this.toolsDir, 'ffmpeg.exe');
    }

    async ensureToolsDirectory() {
        try {
            await fs.mkdir(this.toolsDir, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    async downloadFile(url, filePath) {
        return new Promise((resolve, reject) => {
            const file = require('fs').createWriteStream(filePath);
            
            https.get(url, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Handle redirect
                    return this.downloadFile(response.headers.location, filePath)
                        .then(resolve)
                        .catch(reject);
                }
                
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download: ${response.statusCode}`));
                    return;
                }
                
                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
                
                file.on('error', (error) => {
                    fs.unlink(filePath).catch(() => {}); // Clean up on error
                    reject(error);
                });
            }).on('error', (error) => {
                reject(error);
            });
        });
    }

    async downloadYtDlp() {
        console.log('Downloading yt-dlp...');
        
        try {
            const ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
            await this.downloadFile(ytDlpUrl, this.ytDlpPath);
            
            // Make executable (Windows doesn't need this, but good practice)
            await fs.chmod(this.ytDlpPath, 0o755);
            
            console.log('yt-dlp downloaded successfully!');
            return true;
        } catch (error) {
            console.error('Failed to download yt-dlp:', error.message);
            return false;
        }
    }

    async downloadFFmpeg() {
        console.log('Downloading ffmpeg...');
        
        try {
            // For Windows, we'll download a pre-built ffmpeg
            const ffmpegUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
            const zipPath = path.join(this.toolsDir, 'ffmpeg.zip');
            
            // Remove existing zip file if it exists
            try {
                await fs.unlink(zipPath);
            } catch (error) {
                // File doesn't exist, that's fine
            }
            
            await this.downloadFile(ffmpegUrl, zipPath);
            
            // Extract ffmpeg.exe from the zip
            await this.extractFFmpeg(zipPath);
            
            // Clean up zip file
            try {
                await fs.unlink(zipPath);
            } catch (error) {
                console.warn('Could not clean up zip file:', error.message);
            }
            
            console.log('ffmpeg downloaded successfully!');
            return true;
        } catch (error) {
            console.error('Failed to download ffmpeg:', error.message);
            return false;
        }
    }

    async extractFFmpeg(zipPath) {
        return new Promise((resolve, reject) => {
            yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                if (err) {
                    reject(err);
                    return;
                }

                zipfile.readEntry();
                zipfile.on('entry', (entry) => {
                    // Look for ffmpeg.exe in any subdirectory
                    if (entry.fileName.endsWith('ffmpeg.exe')) {
                        console.log(`Found ffmpeg.exe at: ${entry.fileName}`);
                        
                        zipfile.openReadStream(entry, (err, readStream) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            const writeStream = require('fs').createWriteStream(this.ffmpegPath);
                            
                            readStream.pipe(writeStream);
                            
                            writeStream.on('close', () => {
                                console.log(`FFmpeg extracted to: ${this.ffmpegPath}`);
                                zipfile.close();
                                resolve();
                            });
                            
                            writeStream.on('error', (err) => {
                                reject(err);
                            });
                        });
                    } else {
                        // Continue to next entry
                        zipfile.readEntry();
                    }
                });

                zipfile.on('end', () => {
                    // If we reach here without finding ffmpeg.exe, it's an error
                    reject(new Error('ffmpeg.exe not found in zip file'));
                });

                zipfile.on('error', (err) => {
                    reject(err);
                });
            });
        });
    }

    async checkYtDlp() {
        try {
            await fs.access(this.ytDlpPath);
            return true;
        } catch {
            return false;
        }
    }

    async checkFFmpeg() {
        try {
            await fs.access(this.ffmpegPath);
            return true;
        } catch {
            return false;
        }
    }

    async testYtDlp() {
        return new Promise((resolve) => {
            const test = spawn(this.ytDlpPath, ['--version']);
            
            test.on('close', (code) => {
                resolve(code === 0);
            });
            
            test.on('error', () => {
                resolve(false);
            });
        });
    }

    async testFFmpeg() {
        return new Promise((resolve) => {
            const test = spawn(this.ffmpegPath, ['-version']);
            
            test.on('close', (code) => {
                resolve(code === 0);
            });
            
            test.on('error', () => {
                resolve(false);
            });
        });
    }

    async setup() {
        console.log('Setting up Playlistifier tools...');
        
        await this.ensureToolsDirectory();
        
        let success = true;
        
        // Check and download yt-dlp
        if (!(await this.checkYtDlp()) || !(await this.testYtDlp())) {
            success = await this.downloadYtDlp() && success;
        } else {
            console.log('yt-dlp already available');
        }
        
        // Check and download ffmpeg
        if (!(await this.checkFFmpeg()) || !(await this.testFFmpeg())) {
            success = await this.downloadFFmpeg() && success;
        } else {
            console.log('ffmpeg already available');
        }
        
        if (success) {
            console.log('All tools ready!');
        } else {
            console.error('Some tools failed to setup');
        }
        
        return success;
    }

    getYtDlpPath() {
        return this.ytDlpPath;
    }

    getFFmpegPath() {
        return this.ffmpegPath;
    }
}

module.exports = new SetupManager();
