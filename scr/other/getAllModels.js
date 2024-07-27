async function getModelIds() {
    try {
      const response = await fetch('http://localhost:8000/v1/models');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data || !data.data) {
        throw new Error('Unexpected response structure');
      }
      
      const modelIds = data.data.map(model => model.id);
      
      console.log('Model IDs:', modelIds);
      
      return modelIds;
    } catch (error) {
      console.error('Error fetching model IDs:', error);
    }
  }
  
  getModelIds();