import { customAlphabet } from "nanoid"

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

export const nanoId = customAlphabet(alphabet, 21)
export const userId = () => `usr_${nanoId()}`
export const projectId = () => `proj_${nanoId()}`
export const dirId = () => `dir_${nanoId()}`
export const authId = () => `auth_${nanoId()}`
export const workspaceFileId = () => `wsf_${nanoId()}`
export const galleryWorkId = () => `glw_${nanoId()}`
