/**
 * Utility functions for preloading images to prevent visual flicker
 */

/**
 * Preloads a single image
 * @param imagePath - The path or URL to the image
 * @returns Promise that resolves when the image is loaded
 */
export function preloadImage(imagePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Skip if already a full URL or data URI
    if (imagePath.startsWith('http') || imagePath.startsWith('data:')) {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load image: ${imagePath}`));
      img.src = imagePath;
      return;
    }

    // Construct full path with PUBLIC_URL
    const publicUrl = process.env.PUBLIC_URL || '';
    const fullPath = `${publicUrl}${imagePath.startsWith('/') ? imagePath : `/${imagePath}`}`;

    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => {
      // Silently fail - don't block the game if an image fails to load
      console.warn(`Failed to preload image: ${fullPath}`);
      resolve(); // Resolve anyway to not block the game
    };
    img.src = fullPath;
  });
}

/**
 * Preloads multiple images in parallel
 * @param imagePaths - Array of image paths to preload
 * @returns Promise that resolves when all images are loaded (or failed)
 */
export function preloadImages(imagePaths: string[]): Promise<void> {
  const validPaths = imagePaths.filter(path => path && path.trim() !== '');
  if (validPaths.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(validPaths.map(path => preloadImage(path))).then(() => {
    // All images loaded (or failed gracefully)
  });
}

/**
 * Preloads all images from story cards
 * @param storyCards - Array of story cards with image paths
 * @returns Promise that resolves when all images are loaded
 */
export function preloadStoryCardImages(storyCards: Array<{ image?: string }>): Promise<void> {
  const imagePaths = storyCards
    .map(card => card.image)
    .filter((image): image is string => !!image);

  return preloadImages(imagePaths);
}

/**
 * Preloads all story card images from all levels (1-5)
 * This should be called when the app first loads
 * @returns Promise that resolves when all images are loaded
 */
export async function preloadAllStoryCardImages(): Promise<void> {
  const MAX_LEVEL = 5;
  const imagePaths: string[] = [];
  const publicUrl = process.env.PUBLIC_URL || '';

  // Load all level configs and collect image paths
  const loadPromises: Promise<void>[] = [];
  
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const loadPromise = fetch(`${publicUrl}/levels/level${level}.json`)
      .then(response => {
        if (!response.ok) return;
        return response.json();
      })
      .then((config: { storyCards?: Array<{ image?: string }> }) => {
        if (config?.storyCards) {
          config.storyCards.forEach(card => {
            if (card.image) {
              imagePaths.push(card.image);
            }
          });
        }
      })
      .catch(() => {
        // Silently fail for levels that don't exist
      });
    
    loadPromises.push(loadPromise);
  }

  // Also add end-of-story images (these are used in the end-of-story cards)
  imagePaths.push(
    `/demo_end_EdranWins.png`,
    `/demo_end_horror.png`,
    `/demo_end_sunpowder.png`
  );

  // Wait for all configs to load, then preload all images
  await Promise.all(loadPromises);
  
  // Remove duplicates
  const uniquePaths = Array.from(new Set(imagePaths));
  
  // Preload all images
  return preloadImages(uniquePaths);
}

