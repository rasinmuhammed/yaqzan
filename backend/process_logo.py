from PIL import Image
import numpy as np

# Load original
img = Image.open('/Users/muhammedrasin/.gemini/antigravity-ide/brain/da2e5550-1d6a-4d1c-a0d8-a059895873d4/yaqzan_logo_wave_eye_1781404056415.png').convert('RGBA')
arr = np.array(img)

# Crop to the top square part (ignoring text at the bottom)
height, width = arr.shape[:2]
# The logo is at the top center. The image is 1024x1024. Let's crop it to 200:750, 200:824 approx.
# We can find bounding box of non-white pixels
alpha = arr[:,:,3]
r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
# Non-white pixels are where r < 250 or g < 250 or b < 250
mask = (r < 250) | (g < 250) | (b < 250)

# But wait, we want to discard the text "YAQZAN TECHNOLOGIES" at the bottom.
# The text is below y=600. Let's just crop y < 600.
arr = arr[:600, :]
mask = mask[:600, :]

# Find bounding box
coords = np.argwhere(mask)
y0, x0 = coords.min(axis=0)
y1, x1 = coords.max(axis=0) + 1

cropped = arr[y0:y1, x0:x1]

# Convert all non-white pixels to white with alpha proportional to their darkness
c_r, c_g, c_b, c_a = cropped[:,:,0], cropped[:,:,1], cropped[:,:,2], cropped[:,:,3]

# Calculate darkness (0 = white, 255 = black)
# We can use grayscale intensity.
gray = 0.2989 * c_r + 0.5870 * c_g + 0.1140 * c_b
# Darkness is 255 - gray
darkness = 255.0 - gray

# Set RGB to white (255, 255, 255)
# Set Alpha to darkness
out_r = np.full_like(c_r, 255)
out_g = np.full_like(c_g, 255)
out_b = np.full_like(c_b, 255)
out_a = np.clip(darkness * 1.5, 0, 255).astype(np.uint8) # Boost alpha slightly for crispness

out_img = np.dstack((out_r, out_g, out_b, out_a))

# Save
Image.fromarray(out_img, 'RGBA').save('/Users/muhammedrasin/yaqzan/frontend/public/yaqzan-logo.png')
print("Processed logo saved!")
