---
layout: page
title: "Qualtrics Resources"
permalink: /qualtrics-resources/
---
<link rel="stylesheet" href="/assets/css/qualtrics-resources.css">

This page collects small scripts and code snippets for enhancing Qualtrics surveys. Each functionality has downloadable code and instructions for use. I am not a JavaScript specialist so codes may be imperfect, but these can provide a useful starter.

---

## Summary of resources

<table class="summary-table">
<thead>
<tr>
<th>Functionality</th>
<th>Resource Types</th>
<th>Summary Description</th>
</tr>
</thead>
<tbody>
{% for resource in site.data.qualtrics-resources %}
<tr>
<td><a href="#{{ resource.id }}">{{ resource.title }}</a></td>
<td>{{ resource.functionality }}</td>
<td>{{ resource.summary }}</td>
</tr>
{% endfor %}
</tbody>
</table>

<hr>

{% for resource in site.data.qualtrics-resources %}

### {{ resource.title }}

**Description**:

{{ resource.long_description }}

- **Resources**:
  {% for file in resource.files %}
  - [Open {{ file }}](../assets/qualtrics-resources/{{ file }}) • [Download](../assets/qualtrics-resources/{{ file }}){:download}
  {% endfor %}

{% if resource.images %}

- **Examples**:
  {% for image in resource.images %}
  <div class="resource-image">
      <img src="{{ image.src }}" alt="{{ image.caption }}" style="max-width:100%; margin-top:10px;">
      <div style="font-size: 0.9em; color: gray;">{{ image.caption }}</div>
    </div>
  {% endfor %}

{% endif %}

<hr>

{% endfor %}
