import sys
F='fontfile=/System/Library/Fonts/Helvetica.ttc'; FB='fontfile=/System/Library/Fonts/HelveticaNeue.ttc'
def side(i,lab,pw,tag):
    return (f"[{i}:v]setpts=PTS-STARTPTS,fps=60,trim=start_frame=0:end_frame=276,setpts=PTS-STARTPTS,crop=810:210:480:176,setsar=1,format=yuv444p,"
        f"drawbox=x=0:y=130:w=iw:h=2:color=red@0.7:t=fill,pad={pw}:256:0:46:color=white,"
        f"drawtext={F}:text='{lab}':x=12:y=12:fontsize=24:fontcolor=black,"
        f"drawtext={F}:text='%{{eif\\:round((t-0.2)*1000)\\:d}} ms':x=810-tw-12:y=14:fontsize=21:fontcolor=0x444444[{tag}]")
t1='Close-up - the top row (logo / language / Join waitlist) while one slow push opens the menu'
t2='iPhone 15 Pro Max - Safari - robot slow push at the end of the page - actual device pixels - 2x slower - ms after the push starts - red line marks where the row comes to rest'
g=[side(0,'original site',820,'h0'),side(1,'v14 (7 Oct best build)',810,'h1'),
   f"[h0][h1]hstack=inputs=2,pad=1630:340:0:0:color=white,drawtext={FB}:text='{t1}':x=(w-tw)/2:y=h-74:fontsize=26:fontcolor=black,"
   f"drawtext={F}:text='{t2}':x=(w-tw)/2:y=h-34:fontsize=18:fontcolor=0x444444,setpts=round(N/30/TB),fps=60,tpad=stop_mode=clone:stop_duration=0.8,setsar=1,format=yuv420p[out]"]
open(sys.argv[1],'w').write(';\n'.join(g)+'\n')
