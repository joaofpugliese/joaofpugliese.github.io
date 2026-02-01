# Photography Gallery Instructions

This document explains how to add and manage your photo albums.

---

## Quick Start: Adding a New Album

### Step 1: Create the Photo Folder

Create a new folder for your album images:

```
assets/img/photography/[your-album-slug]/
```

For example: `assets/img/photography/california-trip/`

### Step 2: Add Your Photos

1. Copy your photos into the folder you just created
2. **Required**: Add a `cover.jpg` image - this will be the album thumbnail
3. Name your photos simply (e.g., `photo1.jpg`, `sunset.jpg`, `beach-view.jpg`)
4. **Recommended**: Resize images to max 1600px wide to keep the site fast

### Step 3: Register the Album

Edit `_data/photography-albums.yml` and add your album:

```yaml
- title: "California Trip"
  slug: california-trip           # Must match your folder name!
  date: "Summer 2024"
  location: "California, USA"
  photo_count: 12                 # Update with actual count
  description: "Road trip along the coast"
  layout: grid                    # Options: grid, masonry, horizontal-strips
```

### Step 4: Create the Album Page

Create a new file in `_pages/photography/[your-album-slug].md`:

```markdown
---
layout: photography-album
title: "California Trip"
permalink: /photography/california-trip/
album_slug: california-trip
date: "Summer 2024"
location: "California, USA"
description: "A beautiful road trip along Highway 1."
gallery_layout: grid

photos:
  - filename: photo1.jpg
    caption: "Sunset at Big Sur"
  - filename: photo2.jpg
    caption: "Golden Gate Bridge"
  - filename: photo3.jpg
---
```

---

## File Structure Overview

```
joaofpugliese.github.io/
├── _data/
│   └── photography-albums.yml      # Album registry (for main page)
├── _layouts/
│   └── photography-album.liquid    # Album page template
├── _pages/
│   ├── photography.md              # Main photography page
│   └── photography/
│       ├── INSTRUCTIONS.md         # This file
│       ├── example-album.md        # Example album page
│       └── your-album.md           # Your album pages go here
└── assets/
    ├── css/
    │   └── photography.css         # Gallery styles
    └── img/
        └── photography/
            ├── example-album/
            │   ├── cover.jpg       # Album thumbnail
            │   ├── photo1.jpg
            │   └── photo2.jpg
            └── your-album/         # Your photo folders
                ├── cover.jpg
                └── ...
```

---

## Gallery Layout Options

### 1. Grid (Default)
A clean, uniform grid of photos.
```yaml
gallery_layout: grid
```

### 2. Masonry
Pinterest-style layout that preserves photo aspect ratios.
```yaml
gallery_layout: masonry
```

### 3. Horizontal Strips
Horizontally scrollable strips of photos (great for panoramics).
```yaml
gallery_layout: horizontal-strips
```

---

## Photo Specifications

### Recommended Sizes
- **Cover image**: 800x600px (4:3 ratio works best)
- **Gallery photos**: Max 1600px on longest side
- **Format**: JPG for photos, PNG for graphics

### Optimization Tips
1. Use tools like [TinyPNG](https://tinypng.com/) or [Squoosh](https://squoosh.app/) to compress images
2. Strip EXIF data if you want to remove location metadata
3. Keep file sizes under 500KB per image for fast loading

---

## Accessing Your Photography Page

Since this page is hidden from the navigation menu, you can access it at:

```
https://joaofpugliese.github.io/photography/
```

To share specific albums:
```
https://joaofpugliese.github.io/photography/[album-slug]/
```

---

## Adding the Page to Navigation (Optional)

If you want the photography page to appear in the navbar, edit `_pages/photography.md` and add:

```yaml
---
layout: page
title: Photography
permalink: /photography/
nav: true              # Add this line
nav_order: 5           # Adjust the order as needed
---
```

---

## Troubleshooting

### Photos not showing?
1. Check that the `album_slug` matches the folder name exactly
2. Verify file names match between the YAML and actual files
3. Make sure images are in `.jpg`, `.jpeg`, or `.png` format

### Album not appearing on main page?
1. Ensure you added it to `_data/photography-albums.yml`
2. Check that `slug` matches `album_slug` in the page
3. Make sure `cover.jpg` exists in the album folder

### Styles look broken?
Clear your browser cache or try a hard refresh (Ctrl+Shift+R / Cmd+Shift+R)

---

## Example Album Template

Copy this template for new albums:

```markdown
---
layout: photography-album
title: "Album Title"
permalink: /photography/album-slug/
album_slug: album-slug
date: "Month Year"
location: "City, Country"
description: "Brief description of this collection."
gallery_layout: grid

photos:
  - filename: cover.jpg
    caption: "Cover shot"
  - filename: image1.jpg
    caption: "Description"
  - filename: image2.jpg
  - filename: image3.jpg
    caption: "Another great shot"
---
```

---

Happy photographing! 📷



