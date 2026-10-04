// Synthetic PNGs, generated locally; no third-party images or rights inferred.
import {crc32,deflateSync} from 'node:zlib';
export function syntheticPNG(width=96,height=96,accent=[12,124,143]){
 const chunk=(type,data)=>{const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 const pixels=Buffer.alloc((width*3+1)*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const color=(x>width/4&&x<width*3/4&&y>height/4&&y<height*3/4)?accent:[248,245,239];for(let c=0;c<3;c++)pixels[y*(width*3+1)+1+x*3+c]=color[c];}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
