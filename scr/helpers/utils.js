const { v4: uuidv4 } = require('uuid');

exports.generateRandomId = () => {
  const uuid = uuidv4();
  
  return uuid.replace(/-/g, '').substring(0, 29);
};