import { SetMetadata } from '@nestjs/common';

export const MinRole = (role: number) => SetMetadata('role', role);
export const AdminOnly = () => MinRole(2);
export const GerenteOuAdmin = () => MinRole(1);
