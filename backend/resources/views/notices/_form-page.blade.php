{{--
  One A4 form page: the blank DTI form as a background image (rendered once from the root HTML forms, which dompdf
  cannot draw because they are inline SVG) with the notice's values positioned on top, in points.
  Coordinates come from the source forms' SVG viewBox (595.4 x 841.9), which maps 1:1 to points on A4.
--}}
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .form-page { position: relative; width: 595.28pt; height: 841.89pt; overflow: hidden; background: #fff; }
  .form-page .bg { position: absolute; left: 0; top: 0; width: 595.28pt; height: 841.89pt; }
  .form-page .w { position: absolute; background: #fff; }
  .form-page .t { position: absolute; white-space: nowrap; font-family: Helvetica, Arial, sans-serif; line-height: 1; color: #000; }
  .form-page .p { position: absolute; font-family: Helvetica, Arial, sans-serif; color: #000; text-align: justify; }
  .form-page .b { font-weight: bold; }
  .form-page .u { text-decoration: underline; }
</style>
<div class="form-page">
  <img class="bg" src="data:image/png;base64,{{ base64_encode(file_get_contents(resource_path("notices/$background"))) }}" alt="">
  {{ $slot }}
</div>
