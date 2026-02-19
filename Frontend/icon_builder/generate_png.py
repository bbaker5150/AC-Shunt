import os
from PIL import Image

def generate_manifest_icons(input_file):
    # Check if file exists
    if not os.path.exists(input_file):
        print(f"Error: Could not find '{input_file}' in the current directory.")
        return

    # The required sizes for a standard web manifest
    sizes = [192, 512]
    
    try:
        with Image.open(input_file) as img:
            # Ensure we are working with RGBA (transparency support)
            img = img.convert("RGBA")
            
            print(f"Processing '{input_file}'...")
            
            for size in sizes:
                # Use LANCZOS filter for high-quality downsampling
                resized_img = img.resize((size, size), Image.Resampling.LANCZOS)
                
                # Define output filename
                output_filename = f"logo{size}.png"
                
                # Save the file
                resized_img.save(output_filename, format="PNG")
                print(f"✔ Generated: {output_filename}")
                
            print("\nSuccess! Don't forget to update your manifest.json paths.")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    source_image = "icon.png"
    
    generate_manifest_icons(source_image)