'use strict';
const zlib = require('zlib');
const fs = require('fs');

function readChunck(offset, buf)
{
	//check that the buffer is not too short and that it contains the length at least
	if (buf.length < offset + 4)
	{
		throw new Error("Invalid or corrupted PNG");
	}

	//extracting chunk length wich is the length of the chunk data field in this chunk
	const len = buf.readUInt32BE(offset);
	console.log(`chunklen: ${len}`);

	//check that i can do only after i have the len of the data in the buffer it checks the buffer is at least long enough to contain chunck len chunck type chunk data and CRC
	if (buf.length < offset + 12 + len)
	{
		throw new Error("Invalid or corrupted PNG");
	}

	//extracting chunk type
	const type = buf.toString('ascii', offset + 4, offset + 8)
	console.log(`buf type: ${type}`);

	//extraction chunk data
	const data = buf.subarray(offset + 8, offset + 8 + len);

	//check CRC signature
	const computed = zlib.crc32(buf.subarray(offset + 4, offset + 8 + len));
	const stored = buf.readUInt32BE(offset + 8 + len);
	if (computed !== stored)
		throw new Error("Invalid or corrupted PNG");

	return ({ chunk : {len, type, data}, newOffset: offset + 12 + len});
}

function paeth(a, b, c)
{
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);

	if (pa <= pb && pa <= pc)
		return a;
	if (pb <= pc)
		return b;
	return c;
}

function unfilter(rawScanlines, width, height, bytesPerPixel)
{
	const stride = width * bytesPerPixel;       // pixel bytes in one row
	const pixels = Buffer.alloc(height * stride);

	for (let y = 0; y < height; y++)
	{
		const inRow = y * (stride + 1);          // where this row starts in the inflated data
		const filterType = rawScanlines[inRow];
		const outRow = y * stride;               // where this row starts in the output
		const prevRow = outRow - stride;         // only used when y > 0

		for (let x = 0; x < stride; x++)
		{
			const raw = rawScanlines[inRow + 1 + x];

			// neighbors come from the OUTPUT (already reconstructed), 0 outside the image
			const a = x >= bytesPerPixel ? pixels[outRow + x - bytesPerPixel] : 0;
			const b = y > 0 ? pixels[prevRow + x] : 0;
			const c = (x >= bytesPerPixel && y > 0) ? pixels[prevRow + x - bytesPerPixel] : 0;

			let value;
			switch (filterType)
			{
				case 0: value = raw; break;
				case 1: value = raw + a; break;
				case 2: value = raw + b; break;
				case 3: value = raw + Math.floor((a + b) / 2); break;
				case 4: value = raw + paeth(a, b, c); break;
				default: throw new Error(`invalid PNG: unknown filter type ${filterType} in row ${y}`);
			}
			pixels[outRow + x] = value & 0xFF;
		}
	}
	return pixels;
}

function main()
{
	const buf2 = fs.readFileSync('./pixil-frame-00.png');
	const buf = fs.readFileSync('./output-onlinepngtools2.png');

	const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

	if (!(buf.subarray(0,8).equals(pngSignature)))
	{
		console.error("Invalid or corrupted PNG");
		process.exit(1);
	}

	console.log(`buf_length: ${buf.length}, buf2_length: ${buf2.length}`);

	let offset = 8;

	//first i handle the first chunk that must be of type IHDR
	const { chunk: firstChunk, newOffset: afterIhdr } = readChunck(offset, buf);
	offset = afterIhdr;

	if (!(firstChunk.type == "IHDR" && firstChunk.len == 13))
	{
		console.error("Invalid or corrupted PNG");
		process.exit(1);
	}

	console.log(`offset: ${offset}`);

	const imgWidth = firstChunk.data.readUInt32BE(0);
	const imgHeight = firstChunk.data.readUInt32BE(4);
	const bitDepth = firstChunk.data.readUInt8(8);
	const colorType = firstChunk.data.readUInt8(9);
	const compressionMethod = firstChunk.data.readUInt8(10);
	const filterMethod = firstChunk.data.readUInt8(11)
	const InterlaceMethod = firstChunk.data.readUInt8(12);

	if (imgWidth <= 0 || imgHeight <= 0)
	{
		console.error("Invalid or corrupted PNG")
		process.exit(1);
	}

	if (!(bitDepth == 8 && (colorType == 2 || colorType == 6)))
	{
		console.error("Unsupported PNG") //to-do make a proper error and exit in that case
		process.exit(1);
	}

	if (compressionMethod != 0 || filterMethod != 0 || InterlaceMethod != 0)
	{
		console.error("Unsupported PNG") //to-do make a proper error and exit in that case
		process.exit(1);
	}
	console.log(`imgWidth:  ${imgWidth}, imgHeight: ${imgHeight}, bitDepth: ${bitDepth}, colorType: ${colorType}, InterlaceMethod: ${InterlaceMethod}`);


	//now a while loop to iterate the folowing chunks wich will mostly be IDAT chunks because i dont't handle chunks of ancillary type
	let onlyConsecutiveIdat = 0;
	let foundIendChunk = false;

	const idatParts = [];
	while(offset < buf.length && foundIendChunk == false) //not sure about this condition
	{
		const {chunk, newOffset} = readChunck(offset, buf);
		offset = newOffset;

		if (chunk.type == "IDAT")
		{
			if (onlyConsecutiveIdat == 0)
				onlyConsecutiveIdat = 1;
			if (onlyConsecutiveIdat != 1)
			{
				console.error("Invalid or corrupted PNG")
				process.exit(1);
			}
			idatParts.push(chunk.data);
		}
		else
		{
			if (onlyConsecutiveIdat == 1)
				onlyConsecutiveIdat = 2;
		}

		if (chunk.type == "IEND")//check there is only one chunk of type IEND
		{
			foundIendChunk = true;
		}

	}
	if (onlyConsecutiveIdat == 0 || foundIendChunk == false)
	{
		console.error("Invalid or corrupted PNG");//if there is not at least one chunk of type IDAT the png is invalid
		process.exit(1);
	}

	const compressedPixelData = Buffer.concat(idatParts);

	console.log(`final offset: ${offset}, compressedPixelData length: ${compressedPixelData.length}`);

	const rawScanLines = zlib.inflateSync(compressedPixelData);

	const bytesPerPixel = (colorType == 6) ? 4 : 3;

	const expectedLength = imgHeight * (1 + imgWidth * bytesPerPixel);

	if (expectedLength != rawScanLines.length)
		throw new Error("invalid PNG unexpected PixelData length");
	else
		console.log("PixelData length as expected: " + rawScanLines.length);

	const pixels = unfilter(rawScanLines, imgWidth, imgHeight, bytesPerPixel);

	// debug: only sensible for tiny images
	for (let y = 0; y < imgHeight; y++)
	{
		for (let x = 0; x < imgWidth; x++)
		{
			const i = (y * imgWidth + x) * bytesPerPixel;
			console.log(`(${x},${y}): ${[...pixels.subarray(i, i + bytesPerPixel)]}`);
		}
	}

}

try { main(); }
catch (e) { console.error(e.message); process.exit(1); }
