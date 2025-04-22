import path from "path"
import { appPath } from "../kiPaths.js"
import fs from "fs"
export const hasPrisma = ()=>{
    const prismaDirectoryFullPath = path.join(appPath, "prisma", "schema.prisma")
    return fs.existsSync(prismaDirectoryFullPath)
}