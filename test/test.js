const test = require('ava');
const dayjs = require('dayjs');
const mongoose = require('mongoose');
const slug = require('speakingurl');

const mongooseSlugPlugin = require('..');

mongoose.connect('mongodb://localhost/mongoose_slug_plugin');
mongoose.Promise = global.Promise;

const BlogPost = new mongoose.Schema({
  title: { type: String, required: true }
});
BlogPost.plugin(mongooseSlugPlugin, { tmpl: '<%=title%>' });
const BlogPosts = mongoose.model('BlogPost', BlogPost);

const CustomBlogPost = new mongoose.Schema({
  title: { type: String, required: true, unique: true },
  posted_at: { type: Date, required: true }
});
CustomBlogPost.plugin(mongooseSlugPlugin, {
  tmpl: "<%=title%>-<%=dayjs(posted_at).format('YYYY-MM-DD')%>",
  locals: { dayjs }
});
const CustomBlogPosts = mongoose.model('CustomBlogPost', CustomBlogPost);

test('custom locals', async t => {
  const title = 'custom locals';
  const posted_at = new Date();
  const blogPost = await CustomBlogPosts.create({ title, posted_at });
  t.is(
    blogPost.slug,
    slug(`${title}-${dayjs(posted_at).format('YYYY-MM-DD')}`)
  );
});

test('preserve slug history', async t => {
  const title = 'preserve slug history';
  let blogPost = await BlogPosts.create({ title });
  t.is(blogPost.slug, slug(title));
  t.deepEqual(blogPost.toObject().slug_history, [slug(title)]);
  blogPost.title = 'new slug to be preserved';
  blogPost = await blogPost.save();
  t.is(blogPost.slug, slug('new slug to be preserved'));
  t.deepEqual(
    blogPost.toObject().slug_history.sort(),
    [slug('new slug to be preserved'), slug(title)].sort()
  );
});

test('increment slugs', async t => {
  const title = 'increment slugs';
  const blogPost = await BlogPosts.create({ title });
  const newBlogPost = await BlogPosts.create({
    title,
    slug: blogPost.slug
  });
  t.is(newBlogPost.slug, `${blogPost.slug}-1`);
  const smartBlogPost = await BlogPosts.create({
    title,
    slug: newBlogPost.slug
  });
  t.is(smartBlogPost.slug, `${blogPost.slug}-2`);
});

test('custom error message', async t => {
  const Schema = new mongoose.Schema({ title: String });
  Schema.plugin(mongooseSlugPlugin, {
    tmpl: '<%=title%>',
    errorMessage: 'A custom error message'
  });
  const Model = mongoose.model('Custom', Schema);
  const err = await t.throwsAsync(() => Model.create({}));
  t.is(err.message, 'A custom error message');
});

test('error message is translated', async t => {
  const Schema = new mongoose.Schema({ title: String, locale: String });
  Schema.plugin(mongooseSlugPlugin, {
    tmpl: '<%=title%>',
    errorMessage: 'A custom error message',
    i18n: {
      t: message => message
    }
  });
  const Model = mongoose.model('CustomErrorTranslate', Schema);
  await t.throwsAsync(() => Model.create({ locale: 'en' }), {
    message: 'A custom error message'
  });
});

test('custom slug field', async t => {
  const Schema = new mongoose.Schema({ title: String });
  Schema.plugin(mongooseSlugPlugin, {
    tmpl: '<%=title%>',
    alwaysUpdateSlug: false
  });
  const Model = mongoose.model('CustomSlugField', Schema);

  const title = 'custom slug field';
  const model = await Model.create({ title, slug: 'this slugged' });

  t.is(model.slug, slug('this slugged'));
});

test('custom slug history', async t => {
  const title = 'custom slug history';
  let blogPost = await BlogPosts.create({ title });

  blogPost.slug_history = undefined;
  blogPost = await blogPost.save();

  t.true(Array.isArray(blogPost.toObject().slug_history));
});

test('getUniqueSlug static', async t => {
  const blogPost = await BlogPosts.create({ title: 'getUniqueSlug static' });

  t.is(
    await BlogPosts.getUniqueSlug(blogPost._id, 'this slugged'),
    slug('this slugged')
  );
});

test('getUniqueSlug static > no str', async t => {
  const blogPost = await BlogPosts.create({ title: 'getUniqueSlug no str' });

  await t.throwsAsync(async () => BlogPosts.getUniqueSlug(blogPost._id), {
    message: 'The `str` argument was missing'
  });
});

test('getUniqueSlug static > hidden', async t => {
  const Schema = new mongoose.Schema({ title: String });
  Schema.plugin(mongooseSlugPlugin, {
    paranoid: 'hidden',
    tmpl: '<%=title%>'
  });

  const Models = mongoose.model('Hidden', Schema);

  const model = await Models.create({ title: 'getUniqueSlug hidden' });

  t.is(
    await Models.getUniqueSlug(model._id, 'this slugged'),
    slug('this slugged')
  );
});

test.todo('custom slug function');
test.todo('custom slug options');
