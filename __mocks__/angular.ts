export default {
  module: () => {
    return {
      directive: jest.fn(),
      factory: jest.fn(),
      service: jest.fn()
    };
  }
};
