from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root = Path(__file__).resolve().parents[1]
for size, path in [(192,'public/icon-192.png'),(512,'public/icon-512.png'),(1024,'apps/mobile/assets/icon.png')]:
    image = Image.new('RGB',(size,size),'#087f73')
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',int(size*.76))
    box=draw.textbbox((0,0),'n',font=font)
    draw.text(((size-(box[2]-box[0]))/2-box[0],(size-(box[3]-box[1]))/2-box[1]-size*.015),'n',font=font,fill='white')
    image.save(root/path)
Image.open(root/'public/icon-192.png').save(root/'app/favicon.ico',sizes=[(32,32),(48,48)])
