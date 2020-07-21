# mongoose-slug-plugin

[![build status](https://img.shields.io/travis/ladjs/mongoose-slug-plugin.svg)](https://travis-ci.org/ladjs/mongoose-slug-plugin)
[![code coverage](https://img.shields.io/codecov/c/github/ladjs/mongoose-slug-plugin.svg)](https://codecov.io/gh/ladjs/mongoose-slug-plugin)
[![code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![made with lass](https://img.shields.io/badge/made_with-lass-95CC28.svg)](https://lass.js.org)
[![license](https://img.shields.io/github/license/ladjs/mongoose-slug-plugin.svg)](LICENSE)

> Slugs for [Mongoose][] with history and [i18n][] support (uses [speakingurl][] by default, but you can use any slug library such as [limax][], [slugify][], [mollusc][], or [slugme][])


## Table of Contents

* [Install](#install)
* [Usage](#usage)
* [Static Methods](#static-methods)
* [Options](#options)
* [Slug Tips](#slug-tips)
* [Slug Uniqueness](#slug-uniqueness)
* [Custom Slug Library](#custom-slug-library)
* [Background](#background)
* [Contributors](#contributors)
* [License](#license)


## Install

[npm][]:

```sh
npm install mongoose-slug-plugin
```

[yarn][]:

```sh
yarn add mongoose-slug-plugin
```


## Usage

> Add the plugin to your project (it will automatically generate a slug when the document is validated based off the template string passed)

```js
const mongooseSlugPlugin = require('mongoose-slug-plugin');
const mongoose = require('mongoose');

const BlogPost = new mongoose.Schema({
  title: String
});

BlogPost.plugin(mongooseSlugPlugin, { tmpl: '<%=title%>' });

module.exports = mongoose.model('BlogPost', BlogPost);
```

> If you need to render some custom function in the template string for display purposes, such as outputting a formatted date with [dayjs][]:

```js
const dayjs = require('dayjs');

const mongooseSlugPlugin = require('mongoose-slug-plugin');
const mongoose = require('mongoose');

const BlogPost = new mongoose.Schema({
  title: { type: String, required: true, unique: true },
  posted_at: { type: Date, required: true }
});

BlogPost.plugin(mongooseSlugPlugin, {
  tmpl: "<%=title%>-<%=dayjs(posted_at).format('YYYY-MM-DD')%>",
  locals: { dayjs }
});

module.exports = mongoose.model('BlogPost', BlogPost);
```

> If you're using [Koa][], here's an example showing how to lookup a slug or an archived slug and properly 301 redirect:

```js
const Koa = require('koa');
const Router = require('koa-router');
const Boom = require('boom');

const BlogPosts = require('./blog-post');

const app = new Koa();
const router = new Router();

router.get('/blog/:slug', async (ctx, next) => {
  try {
    // lookup the blog post by the slug parameter
    const blogPost = await BlogPosts.findOne({ slug: ctx.params.slug });

    // if we found it then return early and render the blog post
    if (blogPost) return ctx.render('blog-post', { title: blogPost.title, blogPost });

    // check if the slug changed for the post we're trying to lookup
    blogPost = await BlogPosts.findOne({ slug_history: ctx.params.slug });

    // 301 permanent redirect to new blog post slug if it was found
    if (blogPost) return ctx.redirect(301, `/blog/${blogPost.slug}`);

    // if no blog post found then throw a nice 404 error
    // this assumes that you're using `koa-better-error-handler`
    // and also using `koa-404-handler`, but you don't necessarily need to
    // since koa automatically sets 404 status code if nothing found
    // <https://github.com/ladjs/koa-better-error-handler>
    // <https://github.com/ladjs/koa-404-handler>
    return next();

  } catch (err) {
    ctx.throw(err);
  }
});

app.use(router.routes());
app.listen(3000);
```

> If you're using [Express][], here's an example showing how to lookup a slug or an archived slug and properly 301 redirect:

```js
TODO
```

> Note that you also have access to a static function on the model called `getUniqueSlug`.

This function accepts an `_id` and `str` argument. The `_id` being the ObjectID of the document and `str` being the slug you're searching for to ensure uniqueness.

This function is used internally by the plugin to recursively ensure uniqueness.


## Static Methods

If you have to write a script to automatically set slugs across a collection, you can use the `getUniqueSlug` static method this package exposes on models.

For example, if you want to programmatically set all blog posts to have slugs, run this script (note that you should run the updates serially as the example shows to prevent slug conflicts):

```js
const Promise = require('bluebird'); // exposes `Promise.each`

const BlogPost = require('../app/models/blog-post.js');

(async () => {
  const blogPosts = await BlogPost.find({}).exec();
  await Promise.each(blogPosts, async blogPost => {
    blogPost.slug = null;
    blogPost.slug = await BlogPost.getUniqueSlug(blogPost._id, blogPost.title);
    return blogPost.save();
  }));
})();
```


## Options

Here are the default options passed to the plugin:

* `tmpl` (String) - Required, this should be a [lodash template string][lodash-template-string] (e.g. `<%=title%>` to use the blog post title as the slug)
* `locals` (Object) - Defaults to an empty object, but you can pass a custom object that will be inherited for use in the lodash template string (see above example for how you could use [dayjs][] to render a document's date formatted in the slug)
* `alwaysUpdateSlug` (Boolean) - Defaults to `true` (basically this will re-set the slug to the value it should be based off the template string every time the document is validated (or saved for instance due to pre-save hook in turn calling pre-validate in Mongoose)
* `errorMessage` (String) - Defaults to `Slug was missing or blank`, this is a String that is returned for failed validation (note that it gets translated based off the `this.locale` field if it is set on the document (see [Lad][] for more insight into how this works))
* `logger` (Object) - defaults to `console`, but you might want to use [Lad's logger][lad-logger]
* `slugField` (String) - defaults to `slug`, this is the field used for storing the slug for the document
* `historyField` (String) - defaults to `slug_history`, this is the field used for storing a document's slug history
* `i18n` (Object|Boolean) - defaults to `false`, but accepts a `i18n` object from [Lad's i18n][i18n]
* `slug` (Function) - Defaults to `speakingurl`, but it is a function that converts a string into a slug (see below [Custom Slug Libary](#custom-slug-library) examples)
* `slugOptions` (Object) - An object of options to pass to the slug function when invoked as specified in `options.slug`


## Slug Tips

If you're using the default slug library `speakingurl`, then you might want to pass the option `slugOptions: { "'": '' }` in order to fix contractions.

For example, if your title is "Jason's Blog Post", you probably want the slug to be "jasons-blog-post" as opposed to "jason-s-blog-post".  This option will fix that.

See [pid/speakingurl#105](https://github.com/pid/speakingurl/issues/105) for more information.


## Slug Uniqueness

If a slug of "foo-bar" already exists, and if we are inserting a new document that also has a slug of "foo-bar", then this new slug will automatically become "foo-bar-1".


## Custom Slug Library

If you don't want to use the library `speakingurl` for generating slugs (which this package uses by default), then you can pass a custom `slug` function:

> [limax][] example:

```js
const limax = require('limax');

BlogPost.plugin(mongooseSlugPlugin, { tmpl: '<%=title%>', slug: limax });
```

> [slugify][] example:

```js
const slugify = require('slugify');

BlogPost.plugin(mongooseSlugPlugin, { tmpl: '<%=title%>', slug: slugify });
```

> [mollusc][] example:

```js
const slug = require('mollusc');

BlogPost.plugin(mongooseSlugPlugin, { tmpl: '<%=title%>', slug });
```

> [slugme][] example:

```js
const slugme = require('slugme');

BlogPost.plugin(mongooseSlugPlugin, { tmpl: '<%=title%>', slug: slugme });
```


## Background

I created this package despite knowing that other alternatives like it exist for these reasons:

* No alternative supported i18n localization/translation out of the box
* No alternative used the well-tested and SEO-friendly `speakingurl` package
* No alternative allowed users to pass their own slug library
* No alternative documented how to clearly do a 301 permanent redirect for archived slugs
* No alternative allowed the field names to be customized
* No alternative had decent tests written


## Contributors

| Name             | Website                           |
| ---------------- | --------------------------------- |
| **Nick Baugh**   | <http://niftylettuce.com/>        |
| **shadowgate15** | <https://github.com/shadowgate15> |


## License

[MIT](LICENSE) © [Nick Baugh](http://niftylettuce.com/)


## 

[npm]: https://www.npmjs.com/

[yarn]: https://yarnpkg.com/

[limax]: https://github.com/lovell/limax

[slugify]: https://github.com/simov/slugify

[mollusc]: https://github.com/Zertz/mollusc

[slugme]: https://github.com/arthurlacoste/js-slug-me

[i18n]: https://github.com/ladjs/i18n

[mongoose]: http://mongoosejs.com/

[speakingurl]: https://github.com/pid/speakingurl

[koa]: http://koajs.com/

[express]: https://expressjs.com/

[lodash-template-string]: https://lodash.com/docs/4.17.4#template

[lad-logger]: https://github.com/ladjs/logger

[dayjs]: https://github.com/iamkun/dayjs

[lad]: https://lad.js.org
