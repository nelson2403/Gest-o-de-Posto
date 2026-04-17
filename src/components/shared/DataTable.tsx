'use client'

import {
  useReactTable, getCoreRowModel, getFilteredRowModel,
  getPaginationRowModel, getSortedRowModel, flexRender,
  type ColumnDef, type SortingState, type ColumnFiltersState,
} from '@tanstack/react-table'
import { useState } from 'react'
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Search, ArrowUpDown, ArrowUp, ArrowDown, InboxIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchPlaceholder?: string
  searchColumn?: string
  loading?: boolean
  skeletonRows?: number
  actions?: React.ReactNode
}

function TableSkeleton({ cols, rows }: { cols: number; rows: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-gray-100 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <div className={cn(
                'skeleton h-[14px] rounded',
                c === 0 ? 'w-28' : c % 3 === 0 ? 'w-14' : 'w-20'
              )} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

function EmptyState() {
  return (
    <tbody>
      <tr>
        <td colSpan={999}>
          <div className="flex flex-col items-center justify-center py-14 text-center select-none">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <InboxIcon className="w-5 h-5 text-gray-350" />
            </div>
            <p className="text-[13px] font-medium text-gray-500">Nenhum registro encontrado</p>
            <p className="text-[12px] text-gray-400 mt-0.5">Tente ajustar os filtros ou criar um novo item.</p>
          </div>
        </td>
      </tr>
    </tbody>
  )
}

export function DataTable<TData, TValue>({
  columns, data, searchPlaceholder = 'Buscar...', searchColumn,
  loading = false, skeletonRows = 8, actions,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting]            = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter]  = useState('')

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel:       getCoreRowModel(),
    getFilteredRowModel:   getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel:     getSortedRowModel(),
    onSortingChange:       setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange:  setGlobalFilter,
    globalFilterFn:        'includesString',
    state:                 { sorting, columnFilters, globalFilter },
    initialState:          { pagination: { pageSize: 15 } },
  })

  const totalRows   = table.getFilteredRowModel().rows.length
  const pageCount   = table.getPageCount()
  const currentPage = table.getState().pagination.pageIndex + 1
  const canPrev     = table.getCanPreviousPage()
  const canNext     = table.getCanNextPage()

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <Input
            placeholder={searchPlaceholder}
            value={
              searchColumn
                ? (table.getColumn(searchColumn)?.getFilterValue() as string) ?? ''
                : globalFilter
            }
            onChange={e =>
              searchColumn
                ? table.getColumn(searchColumn)?.setFilterValue(e.target.value)
                : setGlobalFilter(e.target.value)
            }
            className="pl-8 h-9 text-[13px] bg-white border-gray-200 shadow-sm"
          />
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {table.getHeaderGroups().flatMap(hg =>
                  hg.headers.map(header => (
                    <th
                      key={header.id}
                      className={cn(
                        'px-4 py-3 text-left font-medium text-gray-500 whitespace-nowrap select-none',
                        header.column.getCanSort() && 'cursor-pointer hover:text-gray-800 transition-colors',
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <span className="ml-0.5 flex-shrink-0">
                              {header.column.getIsSorted() === 'asc'  && <ArrowUp   className="w-3 h-3 text-orange-500" />}
                              {header.column.getIsSorted() === 'desc' && <ArrowDown  className="w-3 h-3 text-orange-500" />}
                              {!header.column.getIsSorted()           && <ArrowUpDown className="w-3 h-3 opacity-25" />}
                            </span>
                          )}
                        </div>
                      )}
                    </th>
                  ))
                )}
              </tr>
            </thead>

            {loading ? (
              <TableSkeleton cols={columns.length} rows={skeletonRows} />
            ) : table.getRowModel().rows.length === 0 ? (
              <EmptyState />
            ) : (
              <tbody className="divide-y divide-gray-50">
                {table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="hover:bg-orange-50/30 transition-colors duration-100">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-4 py-2.5 text-gray-700">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </div>

      {/* Paginação */}
      {!loading && (
        <div className="flex items-center justify-between text-[12px] text-gray-400 px-0.5">
          <span>
            {totalRows} registro{totalRows !== 1 ? 's' : ''}
            {pageCount > 1 && ` · Página ${currentPage} de ${pageCount}`}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              {[
                { icon: ChevronsLeft,  fn: () => table.setPageIndex(0),          dis: !canPrev },
                { icon: ChevronLeft,   fn: () => table.previousPage(),            dis: !canPrev },
                { icon: ChevronRight,  fn: () => table.nextPage(),                dis: !canNext },
                { icon: ChevronsRight, fn: () => table.setPageIndex(pageCount-1), dis: !canNext },
              ].map(({ icon: Icon, fn, dis }, i) => (
                <Button key={i} variant="outline" size="icon" className="h-7 w-7" onClick={fn} disabled={dis}>
                  <Icon className="w-3 h-3" />
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
