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
      const chatModelCount = data.data.filter(model => model.object === 'model').length;
      const imageModelCount = data.data.filter(model => model.object === 'image_model').length;
      
      console.log(`Model IDs: ${modelIds.length}`);
      console.log(`Chat models: ${chatModelCount}`);
      console.log(`Image models: ${imageModelCount}`);
      console.log('Model IDs:', modelIds);
      
      return modelIds;
    } catch (error) {
      console.error('Error fetching model IDs:', error);
    }
  }
  
  getModelIds();
