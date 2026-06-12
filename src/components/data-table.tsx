"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  renderHover?: (row: TData) => React.ReactNode;
};

export function DataTable<TData, TValue>({ columns, data, renderHover }: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-xl border border-border/70 bg-card shadow-xs overflow-hidden">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent border-border/70">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="font-medium text-xs uppercase tracking-wider text-muted-foreground bg-muted/40 h-10">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const tr = (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"} className="border-border/60 hover:bg-muted/40">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
              if (!renderHover) return tr;
              return (
                <HoverCard key={row.id} openDelay={150} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    {tr}
                  </HoverCardTrigger>
                  <HoverCardContent className="w-96 p-0">
                    {renderHover(row.original)}
                  </HoverCardContent>
                </HoverCard>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center py-1">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}


