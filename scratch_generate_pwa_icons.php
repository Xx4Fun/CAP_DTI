<?php

$sourcePath = 'c:/CAP101_DTI_SYS/logo/price-logo.png';
$outputDir = 'c:/CAP101_DTI_SYS/customer-pwa/public/';

if (!file_exists($sourcePath)) {
    echo "Source image not found: {$sourcePath}\n";
    exit(1);
}

$rawImg = imagecreatefrompng($sourcePath);
$rawW = imagesx($rawImg);
$rawH = imagesy($rawImg);

// Auto-crop to exact non-transparent/non-white logo bounding box
$minX = $rawW; $maxX = 0;
$minY = $rawH; $maxY = 0;

for ($x = 0; $x < $rawW; $x++) {
    for ($y = 0; $y < $rawH; $y++) {
        $rgba = imagecolorat($rawImg, $x, $y);
        $alpha = ($rgba >> 24) & 0x7F;
        $r = ($rgba >> 16) & 0xFF;
        $g = ($rgba >> 8) & 0xFF;
        $b = $rgba & 0xFF;

        // Check if pixel is not fully transparent and not pure white margin
        if ($alpha < 120 && !($r > 250 && $g > 250 && $b > 250)) {
            if ($x < $minX) $minX = $x;
            if ($x > $maxX) $maxX = $x;
            if ($y < $minY) $minY = $y;
            if ($y > $maxY) $maxY = $y;
        }
    }
}

if ($minX > $maxX || $minY > $maxY) {
    // Fallback if full white
    $minX = 0; $maxX = $rawW - 1;
    $minY = 0; $maxY = $rawH - 1;
}

$cropW = $maxX - $minX + 1;
$cropH = $maxY - $minY + 1;

$srcImg = imagecreatetruecolor($cropW, $cropH);
imagealphablending($srcImg, false);
imagesavealpha($srcImg, true);
imagecopy($srcImg, $rawImg, 0, 0, $minX, $minY, $cropW, $cropH);
imagedestroy($rawImg);

echo "Cropped source logo bounding box: {$cropW}x{$cropH} (from {$rawW}x{$rawH})\n";

function createPwaIconMaximized($srcImg, $srcW, $srcH, $targetSize, $outputPath, $paddingRatio = 0.02) {
    $canvas = imagecreatetruecolor($targetSize, $targetSize);
    
    // Fill canvas with pure white background (#ffffff)
    $white = imagecolorallocate($canvas, 255, 255, 255);
    imagefill($canvas, 0, 0, $white);
    
    // Calculate size maximizing canvas area
    $availSize = (int)($targetSize * (1 - 2 * $paddingRatio));
    
    $aspect = $srcW / $srcH;
    if ($aspect >= 1) {
        $dstW = $availSize;
        $dstH = (int)($availSize / $aspect);
    } else {
        $dstH = $availSize;
        $dstW = (int)($availSize * $aspect);
    }
    
    $dstX = (int)(($targetSize - $dstW) / 2);
    $dstY = (int)(($targetSize - $dstH) / 2);
    
    imagealphablending($canvas, true);
    imagecopyresampled($canvas, $srcImg, $dstX, $dstY, 0, 0, $dstW, $dstH, $srcW, $srcH);
    
    imagepng($canvas, $outputPath, 9);
    imagedestroy($canvas);
    echo "Generated Maximized Icon: {$outputPath} ({$targetSize}x{$targetSize})\n";
}

// Generate Maximized PWA icons (98% canvas fill with 1% margin)
createPwaIconMaximized($srcImg, $cropW, $cropH, 192, $outputDir . 'pwa-192x192.png', 0.01);
createPwaIconMaximized($srcImg, $cropW, $cropH, 512, $outputDir . 'pwa-512x512.png', 0.01);
createPwaIconMaximized($srcImg, $cropW, $cropH, 512, $outputDir . 'pwa-maskable-512x512.png', 0.04);
createPwaIconMaximized($srcImg, $cropW, $cropH, 180, $outputDir . 'apple-touch-icon.png', 0.01);
createPwaIconMaximized($srcImg, $cropW, $cropH, 512, $outputDir . 'logo.png', 0.01);
createPwaIconMaximized($srcImg, $cropW, $cropH, 512, $outputDir . 'logo_icon.png', 0.01);

imagedestroy($srcImg);
echo "Maximized PWA icon generation complete!\n";
