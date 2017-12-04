const s = require('underscore.string');
const _ = require('lodash');
const slug = require('speakingurl');

const getUniqueSlug = (constructor, _id, str, i = 0) => {
  return new Promise(async (resolve, reject) => {
    try {
      const search = i === 0 ? str : `${str}-${i}`;
      const count = await constructor.count({
        _id: {
          $ne: _id
        },
        slug: search
      });
      if (count === 0) return resolve(search);
      resolve(getUniqueSlug(constructor, _id, str, i + 1));
    } catch (err) {
      reject(err);
    }
  });
};

const mongooseSlugPlugin = (schema, config = {}) => {
  config = Object.assign(
    {
      tmpl: '',
      locals: {},
      alwaysUpdateSlug: true,
      slug,
      errorMessage: 'Slug was missing or blank',
      logger: console,
      slugField: 'slug',
      historyField: 'slug_history',
      i18n: false,
      slugOptions: {}
    },
    config
  );

  const obj = {};
  obj[config.slugField] = {
    type: String,
    index: true,
    unique: true,
    required: true,
    trim: true,
    validate: {
      isAsync: true,
      validator(val, fn) {
        const message =
          config.i18n && this.locale
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
      const locals = Object.assign({}, config.locals, this.toObject());
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
      this[config.slugField] = await getUniqueSlug(
        this.constructor,
        this._id,
        this[config.slugField]
      );

      // create slug history if it does not exist yet
      if (!Array.isArray(this[config.historyField]))
        this[config.historyField] = [];

      // add the slug to the slug_history
      this[config.historyField].push(this[config.slugField]);

      // make the slug history unique
      this[config.historyField] = _.uniq(this[config.historyField]);

      next();
    } catch (err) {
      config.logger.error(err);
      err.message = config.i18n.t(config.errorMessage, this.locale);
      next(err);
    }
  });

  schema.statics.getUniqueSlug = function(_id, str) {
    return getUniqueSlug(this.constructor, _id, str);
  };

  return schema;
};

module.exports = mongooseSlugPlugin;
