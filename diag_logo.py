from PIL import Image
import os
for f in ['logo.png','logo.webp','logo-sm.png']:
    p=os.path.join('frontend','assets',f)
    if not os.path.exists(p):
        print(f,'MISSING'); continue
    im=Image.open(p).convert('RGBA')
    w,h=im.size
    a=im.split()[3]
    print(f, w, h, 'bytes=',os.path.getsize(p), 'alpha_minmax=',a.getextrema())
    px=im.load()
    print('  corners:',px[0,0],px[w-1,0],px[0,h-1],px[w-1,h-1],px[w//2,h//2])
    hist=a.histogram()
    print('  transparent_px=',hist[0],'opaque_px=',hist[255])
    # edge halo check: sample 5px inset from top-left corner where should be transparent
    halo=0; tot=0
    for y in range(0,12):
        for x in range(0,12):
            r,g,b,al=px[x,y]
            tot+=1
            if al>10 and r>200 and g>200 and b>200:
                halo+=1
    print('  whiteish-semitransparent in 12x12 TL:',halo,'/',tot)
    print('  bbox=',im.getbbox())
