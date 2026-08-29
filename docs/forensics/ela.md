# Error Level Analysis (ELA)

## What is ELA?
Error Level Analysis (ELA) is a forensic technique used to identify areas within a JPEG image that are at different compression levels. It highlights regions that have been modified or spliced from another source, as these manipulated areas often exhibit a different compression history than the rest of the image.

## Why JPEG Compression Matters
JPEG is a lossy compression algorithm. Every time a JPEG is saved, it introduces some amount of data loss (error). When an image is saved multiple times, the compression error settles to a predictable baseline. If a new element is pasted into the image and the composite is saved, the pasted element undergoes its *first* compression cycle at that specific quality, while the rest of the image undergoes a subsequent cycle. This difference in compression generation can be detected.

## The Recompression Process
1. **Decode:** The original evidence JPEG is decoded into a raw bitmap (using Pillow).
2. **Re-encode:** The bitmap is recompressed and saved at a known, controlled quality level (default: 90).
3. **Difference:** The absolute difference between the original pixel values and the newly recompressed pixel values is calculated.

## Pixel-Difference Calculation
We calculate the absolute difference per color channel:
`error = abs(original_pixel - recompressed_pixel)`
This is achieved using vectorized NumPy operations on `int16` arrays to prevent underflow or overflow wrapping.

## Normalization
Raw error values are often very small (e.g., between 0 and 15), making them invisible to the human eye. We normalize the error map to utilize the full 8-bit dynamic range (0-255). 
The chosen formula scales the maximum error found to 255:
`multiplier = 255.0 / max_error`
`normalized_error = raw_error * multiplier`
This preserves the relative structure and intensity of the errors while making them visually distinct.

## Statistics
The ELA engine calculates global numerical statistics (mean, median, max, standard deviation, and percentiles) *before* normalization. This provides objective numerical measurements of the recompression error distribution.

## Interpretation
**Important: ELA is not proof of manipulation.**
Regions that are brighter in the normalized ELA image indicate *elevated recompression error*. While this is a strong indicator of splicing or recent modification, it can also naturally occur in areas with extremely high contrast, sharp text, or flat colors. 

## Limitations
- ELA only works on lossy formats like JPEG. It is meaningless on lossless formats like PNG.
- If an image has been re-saved many times at low quality, or if the manipulation occurred long ago and the composite was re-saved heavily, the ELA signature degrades and becomes undetectable.
- ELA does not produce a binary "fake" or "real" verdict.

## Future Integration
In Sprint 3B, this standalone engine will be integrated into the ForenSight Analysis architecture. It will be triggered via the API, executed asynchronously, and its statistics and normalized error maps will be served to the frontend for human interpretation, eventually feeding into the Evidence Fusion system.
