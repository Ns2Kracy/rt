# 前端页面更新后仍访问旧页面的 meta 处理方案

## 问题说明

前端页面更新后，用户重新访问页面时仍然看到旧内容，常见原因是浏览器复用了缓存中的旧 HTML 页面。

可以在入口 HTML 中通过 `meta` 标签声明禁用缓存，降低浏览器继续使用旧页面的概率。

## 适用场景

- 前端页面已经更新，但浏览器仍显示旧页面。
- 页面是静态 HTML 入口，例如 `index.html`。
- 当前希望只通过前端 HTML 处理缓存问题。
- 希望给其他遇到同类问题的人提供一个简单可复用的处理方式。

## 处理方案

在入口 HTML 的 `<head>` 中加入以下内容：

```html
<meta
    http-equiv="Cache-Control"
    content="no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
/>
<meta http-equiv="Pragma" content="no-cache" />
<meta http-equiv="Expires" content="0" />
```

示例：

```html
<!doctype html>
<html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
            http-equiv="Cache-Control"
            content="no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
        />
        <meta http-equiv="Pragma" content="no-cache" />
        <meta http-equiv="Expires" content="0" />
        <title>App</title>
    </head>
    <body>
        <!-- page content -->
    </body>
</html>
```

## 参数说明

- `no-store`：提示浏览器不要存储页面副本。
- `no-cache`：提示浏览器使用缓存前需要重新校验。
- `must-revalidate`：缓存过期后必须重新校验。
- `proxy-revalidate`：提示代理缓存也需要重新校验。
- `max-age=0`：表示缓存立即过期。
- `Pragma: no-cache`：兼容旧缓存实现。
- `Expires: 0`：表示页面已过期。

## 验证方式

更新页面后，重新访问页面并检查入口 HTML 是否已经包含上述 `meta` 标签。

可以在浏览器 DevTools 中确认：

- 打开 Network 面板。
- 刷新页面。
- 查看入口 HTML 的响应内容。
- 确认 `<head>` 中已经包含 `Cache-Control`、`Pragma`、`Expires` 三类 `meta` 标签。

如果用户本地已经缓存了旧页面，可以让用户先强制刷新一次，之后再确认新页面是否正常加载。

## 注意事项

`meta` 方案是前端页面内的缓存提示。它需要浏览器先拿到包含这些标签的新 HTML 后才会生效，不能主动清除用户本地已经存在的历史缓存。

如果页面已经被旧缓存命中，用户第一次访问时仍可能看到旧页面。此时需要强制刷新或重新打开页面，使浏览器拿到包含这些 `meta` 标签的新 HTML。
