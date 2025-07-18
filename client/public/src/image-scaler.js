/**
 * Image Scaler Utility
 * Handles dynamic switching between pre-scaled images based on zoom level
 */

class ImageScaler {
    constructor() {
        this.scaledImagesPath = 'scaled/';
        this.imageMap = new Map();
        this.initializeImageMap();
    }

    initializeImageMap() {
        // Map original images to their scaled versions
        this.imageMap.set('magnifying_glass.png', {
            0.5: 'magnifying_glass_0_5x.png',
            0.75: 'magnifying_glass_0_8x.png',
            1.0: 'magnifying_glass.png',
            1.25: 'magnifying_glass_1_3x.png',
            1.5: 'magnifying_glass_1_5x.png',
            1.75: 'magnifying_glass_1_8x.png',
            2.0: 'magnifying_glass_2_0x.png',
            2.25: 'magnifying_glass_2_3x.png',
            2.5: 'magnifying_glass_2_5x.png',
            2.75: 'magnifying_glass_2_8x.png',
            3.0: 'magnifying_glass_3_0x.png',
            3.25: 'magnifying_glass_3_3x.png',
            3.5: 'magnifying_glass_3_5x.png',
            3.75: 'magnifying_glass_3_8x.png',
            4.0: 'magnifying_glass_4_0x.png'
        });

        this.imageMap.set('music-note.gif', {
            0.5: 'music-note_0_5x.gif',
            0.75: 'music-note_0_8x.gif',
            1.0: 'music-note.gif',
            1.25: 'music-note_1_3x.gif',
            1.5: 'music-note_1_5x.gif',
            1.75: 'music-note_1_8x.gif',
            2.0: 'music-note_2_0x.gif',
            2.25: 'music-note_2_3x.gif',
            2.5: 'music-note_2_5x.gif',
            2.75: 'music-note_2_8x.gif',
            3.0: 'music-note_3_0x.gif',
            3.25: 'music-note_3_3x.gif',
            3.5: 'music-note_3_5x.gif',
            3.75: 'music-note_3_8x.gif',
            4.0: 'music-note_4_0x.gif'
        });

        this.imageMap.set('bottom-right-decoration.gif', {
            0.5: 'bottom-right-decoration_0_5x.gif',
            0.75: 'bottom-right-decoration_0_8x.gif',
            1.0: 'bottom-right-decoration.gif',
            1.25: 'bottom-right-decoration_1_3x.gif',
            1.5: 'bottom-right-decoration_1_5x.gif',
            1.75: 'bottom-right-decoration_1_8x.gif',
            2.0: 'bottom-right-decoration_2_0x.gif',
            2.25: 'bottom-right-decoration_2_3x.gif',
            2.5: 'bottom-right-decoration_2_5x.gif',
            2.75: 'bottom-right-decoration_2_8x.gif',
            3.0: 'bottom-right-decoration_3_0x.gif',
            3.25: 'bottom-right-decoration_3_3x.gif',
            3.5: 'bottom-right-decoration_3_5x.gif',
            3.75: 'bottom-right-decoration_3_8x.gif',
            4.0: 'bottom-right-decoration_4_0x.gif'
        });
    }

    /**
     * Get the closest available scale for a given zoom level
     * @param {number} zoomLevel - Current zoom level (0.5 to 4.0)
     * @returns {number} - Closest available scale
     */
    getClosestScale(zoomLevel) {
        const availableScales = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5, 3.75, 4.0];
        
        // Find the closest scale
        let closest = availableScales[0];
        let minDiff = Math.abs(zoomLevel - closest);
        
        for (const scale of availableScales) {
            const diff = Math.abs(zoomLevel - scale);
            if (diff < minDiff) {
                minDiff = diff;
                closest = scale;
            }
        }
        
        // console.log(`🔍 Zoom level ${zoomLevel} -> closest scale ${closest}`);
        return closest;
    }

    /**
     * Get the scaled image path for a given original image and zoom level
     * @param {string} originalImageName - Original image filename
     * @param {number} zoomLevel - Current zoom level
     * @returns {string} - Path to the scaled image
     */
    getScaledImagePath(originalImageName, zoomLevel) {
        const scale = this.getClosestScale(zoomLevel);
        const scaleMap = this.imageMap.get(originalImageName);
        
        if (!scaleMap) {
            console.warn(`No scale map found for image: ${originalImageName}`);
            return originalImageName;
        }

        const scaledImageName = scaleMap[scale];
        if (!scaledImageName) {
            console.warn(`No scaled version found for ${originalImageName} at scale ${scale}`);
            return originalImageName;
        }

        const fullPath = this.scaledImagesPath + scaledImageName;
        // console.log(`📸 ${originalImageName} @ ${zoomLevel} -> ${fullPath}`);
        return fullPath;
    }

    /**
     * Update all scaled images based on current zoom level
     * @param {number} zoomLevel - Current zoom level
     */
    updateImagesForZoom(zoomLevel) {
        // console.log(`Updating images for zoom level: ${zoomLevel}`);
        
        // Update magnifying glass icon
        const magnifyingGlass = document.querySelector('.zoom-icon');
        if (magnifyingGlass) {
            const newPath = this.getScaledImagePath('magnifying_glass.png', zoomLevel);
            magnifyingGlass.src = newPath;
        }

        // Update header music note gif
        const musicNote = document.querySelector('.header-gif');
        if (musicNote) {
            const newPath = this.getScaledImagePath('music-note.gif', zoomLevel);
            musicNote.src = newPath;
        }

        // Update bottom right decoration (CSS background)
        const bottomRightPath = this.getScaledImagePath('bottom-right-decoration.gif', zoomLevel);
        const style = document.createElement('style');
        style.textContent = `
            body::after {
                background-image: url('${bottomRightPath}') !important;
            }
        `;
        
        // Remove any existing dynamic style
        const existingStyle = document.querySelector('#dynamic-background-style');
        if (existingStyle) {
            existingStyle.remove();
        }
        
        style.id = 'dynamic-background-style';
        document.head.appendChild(style);
    }

    /**
     * Initialize the image scaler and set up zoom event listener
     */
    initialize() {
        // Set initial images (assuming 1.0 zoom level)
        this.updateImagesForZoom(1.0);
        
        // Listen for zoom changes
        window.addEventListener('zoomChanged', (event) => {
            this.updateImagesForZoom(event.detail.zoomLevel);
        });
    }
}

// Create global instance
window.imageScaler = new ImageScaler();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.imageScaler.initialize();
    });
} else {
    window.imageScaler.initialize();
}
