exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`alter type notification_type add value if not exists 'direct_message';`);
};

exports.down = () => {
  // PostgreSQL enum values cannot be safely removed while rows may use them.
};
