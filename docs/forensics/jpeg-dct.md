# JPEG/DCT Forensic Analysis

## The JPEG Compression Pipeline
The Joint Photographic Experts Group (JPEG) compression standard relies on transforming spatial image data into the frequency domain. The basic pipeline is:
1. **Color Space Conversion**: RGB is typically converted to YCbCr.
2. **Subsampling**: Chrominance channels (Cb, Cr) are often downsampled.
3. **Block Splitting**: The image is divided into $8 \times 8$ pixel blocks.
4. **DCT**: A Discrete Cosine Transform (DCT) is applied to each block.
5. **Quantization**: The continuous DCT coefficients are divided by a Quantization Table and rounded to integers, throwing away high-frequency data.
6. **Entropy Coding**: Huffman encoding compresses the remaining integers losslessly.

## Spatial vs Frequency Domain
- **Spatial Domain**: Represents the image as pixels (X, Y coordinates).
- **Frequency Domain**: Represents the image as a combination of oscillating cosine waves at different frequencies.

## 8x8 Blocks and The DCT
JPEG operates explicitly on $8 \times 8$ blocks. The 2D DCT transforms an $8 \times 8$ spatial block into an $8 \times 8$ matrix of frequency coefficients.
Mathematically, the transform is:
$C = T \times B \times T^T$
where $B$ is the $8 \times 8$ spatial block (shifted by -128) and $T$ is the $8 \times 8$ DCT basis matrix.

### DC Coefficient
The top-left coefficient $C(0,0)$ is the **DC coefficient**. It represents the average intensity (low-frequency baseline) of the entire $8 \times 8$ block.

### AC Coefficients
The remaining 63 coefficients are **AC coefficients**. They represent increasingly higher spatial frequencies moving down and to the right in the matrix.

## Quantization and Tables
Quantization is where JPEG achieves its lossy compression. Each of the 64 DCT coefficients is divided by a corresponding value in a **Quantization Table** and rounded.
- Low quantization values preserve detail.
- High quantization values force coefficients to zero, saving space but losing detail.
ForenSight extracts these Quantization Tables directly from the JPEG file header using Pillow to analyze the compression severity.

## Frequency-Band Analysis
For forensic analysis, coefficients are often grouped into bands:
- **Low-Frequency**: Near the DC coefficient. High energy, containing the macroscopic structure of the image.
- **High-Frequency**: The bottom-right triangle. Low energy, containing sharp edges and fine texture. Heavily targeted by quantization.
- **Mid-Frequency**: The transitional band between low and high.

## Recompression and Double-Compression Observations
When a JPEG is opened, edited, and saved again as a JPEG, it undergoes recompression.
This often results in:
- A change in the Quantization Tables (if the software uses different default tables).
- A measurable drop in high-frequency AC energy.
- An increase in the proportion of AC coefficients forced to exactly zero.

## Visualizations
ForenSight generates a **Global Average DCT Energy Map**. It calculates the mean absolute magnitude of each coefficient position across all blocks in the image and projects it onto an $8 \times 8$ grid (scaled up for visibility). This allows analysts to visually observe how frequency energy is distributed and spot anomalous high-frequency suppression.

## Scientific Limitations
**A JPEG/DCT anomaly does NOT prove manipulation.**
DCT characteristics are heavily influenced by:
- The initial camera ISP pipeline and firmware.
- The specific JPEG quality setting chosen.
- Whether the image was resized or cropped (which forces blocks to misalign).
- Legitimate image editing software saving standards.
- Social media platform compression.

ForenSight's JPEG/DCT module is strictly an **observational tool**. It measures the mathematical reality of the frequency domain but leaves the final forensic interpretation to the analyst or future probabilistic fusion models.
