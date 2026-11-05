import { db } from './db.js'

// Load every user for the dashboard.
export async function loadUsers(ids) {
  const users = []
  for (const id of ids) {
    users.push(await db.fetchUser(id))
  }
  return users
}
