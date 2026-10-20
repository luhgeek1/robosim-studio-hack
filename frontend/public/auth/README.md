# Значки сервисов входа

Локальные SVG для кнопок авторизации и настроек аккаунта. Проверены 20.10.2026.
Геометрия знаков взята из официальных материалов; внешние запросы во время показа формы не нужны.

- `google.svg` — цветной G из [официального набора Google](https://developers.google.com/static/identity/images/signin-assets.zip),
  Android + Web, Light, Square, без текста. Убрана рамка исходной кнопки, viewBox ограничен самим знаком 20×20;
  знак и его цвета сохранены. [Правила оформления](https://developers.google.com/identity/branding-guidelines).
- `yandex.svg` — знак Я из [официального конструктора кнопки](https://autofill.yandex.ru/suggest/button/constructor),
  `.yaPersonalButtonLogo_ya` в `suggest-button-constructor.js`, версия 1.92.0. Круглая маска задана в компоненте.
- `vk.svg` — геометрия `logoSvg` из [VK ID SDK](https://github.com/VKCOM/vkid-web-sdk/blob/master/src/widgets/oneTap/template.ts),
  стандартные фирменные цвета: синий фон и белый знак; viewBox ограничен плиткой.

Значки декоративные: доступное название содержит текст самой кнопки. Товарные знаки принадлежат их владельцам.
