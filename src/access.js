const haveAccess = (token) => {
  return token == process.env.TOKEN;
};

module.exports = haveAccess;
