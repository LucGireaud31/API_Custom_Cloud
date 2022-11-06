const haveAccess = (token) => {
  return process.env.TOKENS.includes(token);
};

module.exports = { haveAccess };
