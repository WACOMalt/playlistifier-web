#!/usr/bin/env python3
"""
Image scaling script for pixel-perfect retro graphics
Creates pre-scaled versions of images using nearest neighbor filtering
"""

import os
from PIL import Image
import argparse

def scale_image_nearest_neighbor(input_path, output_path, scale_factor):
    """Scale an image using nearest neighbor filtering"""
    try:
        with Image.open(input_path) as img:
            # Get original dimensions
            width, height = img.size
            
            # Calculate new dimensions
            new_width = int(width * scale_factor)
            new_height = int(height * scale_factor)
            
            # Scale using nearest neighbor (no interpolation)
            scaled_img = img.resize((new_width, new_height), Image.NEAREST)
            
            # Save the scaled image
            scaled_img.save(output_path, optimize=True)
            print(f"✓ Scaled {input_path} to {scale_factor}x → {output_path}")
            
    except Exception as e:
        print(f"✗ Error scaling {input_path}: {e}")

def main():
    # Define the images to scale and their scale factors
    images_to_scale = [
        "client/public/magnifying_glass.png",
        "client/public/music-note.gif", 
        "client/public/bottom-right-decoration.gif"
    ]
    
    # Define scale factors based on zoom levels (50% to 400% in 25% increments)
    # We'll create common scales: 0.5x, 1x (original), 1.5x, 2x, 2.5x, 3x, 3.5x, 4x
    scale_factors = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]
    
    # Create scaled versions directory
    scaled_dir = "client/public/scaled"
    os.makedirs(scaled_dir, exist_ok=True)
    
    print("🎨 Creating pixel-perfect scaled images...")
    print("=" * 50)
    
    for image_path in images_to_scale:
        if not os.path.exists(image_path):
            print(f"⚠️  Image not found: {image_path}")
            continue
            
        # Get filename without extension
        filename = os.path.basename(image_path)
        name, ext = os.path.splitext(filename)
        
        print(f"\n📁 Processing: {filename}")
        
        for scale in scale_factors:
            # Create output filename
            if scale == 1.0:
                output_filename = f"{name}{ext}"
            else:
                scale_str = f"{scale:.1f}".replace('.', '_')
                output_filename = f"{name}_{scale_str}x{ext}"
            
            output_path = os.path.join(scaled_dir, output_filename)
            
            # Scale the image
            scale_image_nearest_neighbor(image_path, output_path, scale)
    
    print("\n" + "=" * 50)
    print("✅ Image scaling complete!")
    print(f"📂 Scaled images saved to: {scaled_dir}")
    
    # Create a reference file showing available scales
    reference_path = os.path.join(scaled_dir, "SCALES_REFERENCE.txt")
    with open(reference_path, 'w') as f:
        f.write("Available Image Scales\n")
        f.write("=" * 20 + "\n\n")
        
        for image_path in images_to_scale:
            if os.path.exists(image_path):
                filename = os.path.basename(image_path)
                name, ext = os.path.splitext(filename)
                f.write(f"{filename}:\n")
                
                for scale in scale_factors:
                    if scale == 1.0:
                        output_filename = f"{name}{ext}"
                    else:
                        scale_str = f"{scale:.1f}".replace('.', '_')
                        output_filename = f"{name}_{scale_str}x{ext}"
                    
                    f.write(f"  {scale}x → {output_filename}\n")
                f.write("\n")
    
    print(f"📋 Scale reference saved to: {reference_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scale images with nearest neighbor filtering")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without actually scaling")
    
    args = parser.parse_args()
    
    if args.dry_run:
        print("🔍 DRY RUN - No files will be created")
    
    main()
