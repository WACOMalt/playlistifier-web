#!/usr/bin/env node
/**
 * Image scaling script for pixel-perfect retro graphics
 * Creates pre-scaled versions of images using nearest neighbor filtering
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { execSync } = require('child_process');

// Define the images to scale
const imagesToScale = [
    'client/public/magnifying_glass.png',
    'client/public/music-note.gif', 
    'client/public/bottom-right-decoration.gif'
];

// Define scale factors based on zoom levels (50% to 400% in 25% increments)
const scaleFactors = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5, 3.75, 4.0];

async function scaleImageNearestNeighbor(inputPath, outputPath, scaleFactor, gifsicle) {
    try {
        const image = sharp(inputPath, { animated: true });
        const metadata = await image.metadata();
        
        const newWidth = Math.round(metadata.width * scaleFactor);
        const newHeight = Math.round(metadata.height * scaleFactor);
        
        await image
            .resize(newWidth, newHeight, {
                kernel: sharp.kernel.nearest,
                fit: 'fill'
            })
            .toFile(outputPath);
            
        if (inputPath.endsWith('.gif')) {
            console.log(`✓ GIF scaled with Sharp: ${inputPath} to ${scaleFactor}x → ${outputPath}`);
        } else {
            console.log(`✓ Scaled ${inputPath} to ${scaleFactor}x → ${outputPath}`);
        }
        
    } catch (error) {
        console.error(`✗ Error scaling ${inputPath}:`, error.message);
    }
}

async function main() {
    // Import gifsicle dynamically
    const gifsicle = await import('gifsicle');
    const gifsicleExec = gifsicle.default;
    
    // Create scaled versions directory
    const scaledDir = 'client/public/scaled';
    
    if (!fs.existsSync(scaledDir)) {
        fs.mkdirSync(scaledDir, { recursive: true });
    }
    
    console.log('🎨 Creating pixel-perfect scaled images...');
    console.log('='.repeat(50));
    
    for (const imagePath of imagesToScale) {
        if (!fs.existsSync(imagePath)) {
            console.log(`⚠️  Image not found: ${imagePath}`);
            continue;
        }
        
        const filename = path.basename(imagePath);
        const name = path.parse(filename).name;
        const ext = path.parse(filename).ext;
        
        console.log(`\n📁 Processing: ${filename}`);
        
        for (const scale of scaleFactors) {
            let outputFilename;
            
            if (scale === 1.0) {
                outputFilename = `${name}${ext}`;
            } else {
                const scaleStr = scale.toFixed(1).replace('.', '_');
                outputFilename = `${name}_${scaleStr}x${ext}`;
            }
            
            const outputPath = path.join(scaledDir, outputFilename);
            
            await scaleImageNearestNeighbor(imagePath, outputPath, scale, gifsicleExec);
        }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Image scaling complete!');
    console.log(`📂 Scaled images saved to: ${scaledDir}`);
    
    // Create a reference file showing available scales
    const referencePath = path.join(scaledDir, 'SCALES_REFERENCE.txt');
    let referenceContent = 'Available Image Scales\n';
    referenceContent += '='.repeat(20) + '\n\n';
    
    for (const imagePath of imagesToScale) {
        if (fs.existsSync(imagePath)) {
            const filename = path.basename(imagePath);
            const name = path.parse(filename).name;
            const ext = path.parse(filename).ext;
            
            referenceContent += `${filename}:\n`;
            
            for (const scale of scaleFactors) {
                let outputFilename;
                
                if (scale === 1.0) {
                    outputFilename = `${name}${ext}`;
                } else {
                    const scaleStr = scale.toFixed(1).replace('.', '_');
                    outputFilename = `${name}_${scaleStr}x${ext}`;
                }
                
                referenceContent += `  ${scale}x → ${outputFilename}\n`;
            }
            referenceContent += '\n';
        }
    }
    
    fs.writeFileSync(referencePath, referenceContent);
    console.log(`📋 Scale reference saved to: ${referencePath}`);
}

if (require.main === module) {
    main().catch(console.error);
}
