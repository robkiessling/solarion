# Icon Font
Icons in this folder are built into a font so that they can be easily used in-line with text
(similar to FontAwesome).

## Adding a new icon

### 1. Download the icon
All the icons so far are from https://game-icons.net/.

When customizing the icon I used the following settings:
- Background: none
- Foreground: black
- Size & preset: 32px
- Download as SVG

Move the downloaded SVG to this folder. 

### 2. Recreate the icomoon font

This part is based on [this guide](https://mediatemple.net/blog/design-creative/creating-implementing-icon-font-tutorial/).

- Import all icons to https://icomoon.io/app
  - Even if you're just adding 1 icon, you will have to re-upload ALL existing icons from this folder
  - When uploading, sort your upload folder by "Date Created". After uploading, re-arrange the Set to "reverse current order",
    so oldest is first. This will make it so you don't have to change as many codes later.
- Select all the icons you just imported & click `Generate Font` at the bottom
- Download & unzip
- Update `src/styles/fonts` with the .eot/.svg/.ttf/.woff files from icomoon download
- Create new classes in `src/styles/icon-font.scss` for the new icons 
  - In new classes in the "Add classes for each icon here" section
  - For the class name, I just make it match the icon file name
  - The `content` codes have to match the codes in the generated fonts file. 
    You can see all content codes in the icomoon download -> demo.html file.
    Hopefully the content codes for existing icons isn't shifted, otherwise
    you will have to update all the old codes too :(

## Using the icons

Similar to FontAwesome, just create a `span` with the appropriate class:

```
<span class="icon-stone-pile"></span>
```

and the icon will appear in line with text. 
You can further customize the icon using CSS (change size, color, etc.).