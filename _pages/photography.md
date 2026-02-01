---
layout: page
title: Photography
permalink: /photography/
description: A personal collection of photographs
---
<link rel="stylesheet" href="{{ '/assets/css/photography.css' | relative_url }}">

<div class="photo-intro">
  <p class="intro-text">Landscapes, travels, and everyday life.</p>
</div>

<div class="album-grid">
  {% for album in site.data.photography-albums %}
  <a href="{{ site.baseurl }}/photography/{{ album.slug }}/" class="album-card">
    <div class="album-cover" style="background-image: url('{{ site.baseurl }}/assets/img/photography/{{ album.slug }}/cover.jpg');">
      <div class="album-overlay">
        <span class="album-count">{{ album.photo_count }} photos</span>
      </div>
    </div>
    <div class="album-info">
      <h3 class="album-title">{{ album.title }}</h3>
      <p class="album-location">{{ album.location }}</p>
      <p class="album-date">{{ album.date }}</p>
    </div>
  </a>
  {% endfor %}
</div>

{% if site.data.photography-albums == nil or site.data.photography-albums.size == 0 %}

<div class="no-albums">
  <p>No albums yet. Check the instructions below to add your first photo album.</p>
</div>
{% endif %}
