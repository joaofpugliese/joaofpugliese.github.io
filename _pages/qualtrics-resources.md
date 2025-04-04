---
layout: page
title: "Qualtrics Resources"
permalink: /qualtrics-resources/
---
# Qualtrics Resources

This page collects small scripts and code snippets for enhancing Qualtrics surveys. Each functionality has downloadable code and instructions for use.

## Summary Table

| Functionality                                                          | Resource Types   | Summary Description                                                                                   |
| :--------------------------------------------------------------------- | :--------------- | :---------------------------------------------------------------------------------------------------- |
| [Customized Sliders](#customized-sliders)                                 | JavaScript       | Custom-styled Qualtrics sliders keeping native styles, including tick marks and embedded data saving. |
| [Video Embedding with Data Tracking](#video-embedding-with-data-tracking) | HTML, JavaScript | Embed videos with optional thumbnails and capture participant interactions.                           |

---

## Customized Sliders

**Description**:This script customizes Qualtrics sliders, preserving native styling. It allows thumb customization, filled progress bars, tick marks, and automatic embedded data saving.

- **Resources**:
  - [Download customized-slider.txt](../assets/qualtrics-resources/customized-slider.txt)

<details>
<summary>View JavaScript Code</summary>

```javascript
// Example JavaScript for customized slider in Qualtrics
Qualtrics.SurveyEngine.addOnload(function() {
  const sliders = document.querySelectorAll('.q-slider');

  sliders.forEach(slider => {
    // Customize the appearance
    slider.style.setProperty('--thumb-size', '24px');
    // Save slider value into Embedded Data
    slider.addEventListener('input', function() {
      Qualtrics.SurveyEngine.setEmbeddedData('SliderValue', this.value);
    });
  });
});
```
