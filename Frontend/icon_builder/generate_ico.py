from PIL import Image, ImageDraw, ImageOps
import os

source_file = "icon.png"

# 1. Load the Image
if not os.path.exists(source_file):
    print(f"Error: Could not find '{source_file}'.")
    exit()

img = Image.open(source_file).convert("RGBA")

# 2. Crop to a perfect square first
width, height = img.size
min_dim = min(width, height)
left = (width - min_dim)/2
top = (height - min_dim)/2
right = (width + min_dim)/2
bottom = (height + min_dim)/2

img = img.crop((left, top, right, bottom))

# 3. Create the Circular Mask (The "Cookie Cutter")
# Create a blank greyscale image the same size as our icon
mask = Image.new('L', img.size, 0)
draw = ImageDraw.Draw(mask)
# Draw a solid white circle in the middle (White = Keep, Black = Delete)
draw.ellipse((0, 0) + img.size, fill=255)

# 4. Apply the mask to the alpha channel
# This makes everything outside the circle transparent
img.putalpha(mask)

# 5. Save the Transparent PNG (For your React Website)
img.save("icon.png", "PNG")
print("Saved: icon.png (Transparent background)")

# 6. Save the ICO (For the Windows App)
# We resize carefully to keep edges smooth
img.save("icon.ico", format='ICO', sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print("Saved: icon.ico (Transparent background)")