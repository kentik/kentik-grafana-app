export function migrate(target: any): void {
  // multiple devices support
  if (target.device !== undefined) {
    target.devices = [target.device];
    target.device = undefined;
  }
}
