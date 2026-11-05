export const db = {
  async fetchUser(id) {
    await new Promise(r => setTimeout(r, 120))
    return { id, name: `user-${id}` }
  },
}
