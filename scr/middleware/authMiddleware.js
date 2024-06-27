module.exports = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || !isValidApiKey(apiKey)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };
  
  function isValidApiKey(apiKey) {
    return true;
  }
  