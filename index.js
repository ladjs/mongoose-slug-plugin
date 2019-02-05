const { callbackify } = require('util');

const s = require('underscore.string');
const _ = require('lodash');
const slug = require('speakingurl');

const getUniqueSlug = async (config, constructor, _id, str, i = 0) => {
  if (s.isBlank(str)) throw new Error('The `str` argument was missing');
  const search = i === 0 ? str : config.slug(`${str}-${i}`, config.slugOptions);
  const query = { _id: { $ne: _id } };
  query[config.slugField] = search;
  if (config.paranoid === 'hidden') query.hidden = { $ne: null };
  const count = await constructor.countDocuments(query);
  if (count === 0) return search;
  return getUniqueSlug(config, constructor, _id, str, i + 1);
};

const mongooseSlugPlugin = (schema, config = {}) => {
  config = {
    tmpl: '',
    locals: {},
    alwaysUpdateSlug: true,
    slug,
    errorMessage: 'Slug was missing or blank',
    logger: console,
    slugField: 'slug',
    historyField: 'slug_history',
    i18n: false,
    slugOptions: {},
    paranoid: false,
    ...config
  };

  const obj = {};
  obj[config.slugField] = {
    type: String,
    index: true,
    unique: true,
    required: true,
    trim: true,
    set: val => config.slug(val, config.slugOptions),
    validate: {
      isAsync: true,
      validator(val, fn) {
        const message =
          config.i18n && config.i18n.t && this.locale
            ? config.i18n.t(config.errorMessage, this.locale)
            : config.errorMessage;
        if (!_.isString(val) || s.isBlank(val)) return fn(false, message);
        fn(true);
      }
    }
  };
  obj[config.historyField] = [
    {
      type: String,
      index: true
    }
  ];
  schema.add(obj);

  schema.pre('validate', async function(next) {
    try {
      const locals = { ...config.locals, ...this.toObject() };
      const str = _.template(config.tmpl)(locals);

      // set the slug if it is not already set
      if (
        !_.isString(this[config.slugField]) ||
        s.isBlank(this[config.slugField]) ||
        config.alwaysUpdateSlug
      ) {
        this[config.slugField] = config.slug(str, config.slugOptions);
      } else {
        // slugify the slug in case we set it manually and not in slug format
        this[config.slugField] = config.slug(
          this[config.slugField],
          config.slugOptions
        );
      }

      // ensure that the slug is unique
      const uniqueSlug = await getUniqueSlug(
        config,
        this.constructor,
        this._id,
        this[config.slugField]
      );
      this[config.slugField] = uniqueSlug;

      // create slug history if it does not exist yet
      if (!Array.isArray(this[config.historyField]))
        this[config.historyField] = [];

      // add the slug to the slug_history
      this[config.historyField].push(this[config.slugField]);

      // make the slug history unique
      this[config.historyField] = _.uniq(this[config.historyField]);

      next();
    } catch (error) {
      config.logger.error(error);
      if (config.i18n && config.i18n.t && this.locale)
        error.message = config.i18n.t(config.errorMessage, this.locale);
      else error.message = config.errorMessage;
      next(error);
    }
  });

  schema.statics.getUniqueSlug = function(_id, str) {
    str = config.slug(str, config.slugOptions);
    return getUniqueSlug(config, this, _id, str);
  };

  schema.statics.getUniqueSlugCallback = callbackify(
    schema.statics.getUniqueSlug
  );

  return schema;
};

module.exports = mongooseSlugPlugin;
