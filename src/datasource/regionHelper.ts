/**
 * Returns the region associated with the kentik-ks
 *
 * @param datasources
 */
function getRegion(datasources: any): string {
  let aRegion = 'default';
  for (const index in datasources) {
    if (datasources[index].type === 'kentik-ds') {
      aRegion = datasources[index].jsonData.region;
      if (aRegion === 'custom') {
        console.log('getRegion(): Custom Dynamic URL: ' + datasources[index].jsonData.dynamicUrl);
      }
      return aRegion;
    }
  }
  return aRegion;
}

export { getRegion };
