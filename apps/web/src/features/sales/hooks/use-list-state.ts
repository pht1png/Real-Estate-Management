import { useEffect, useState } from "react"

/** Page, search (debounced) and one dropdown filter for a list page. Changing a filter goes back to page 1. */
export function useListState<TFilter extends string>() {
  const [page, setPage] = useState(1)
  const [search, setSearchValue] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [filter, setFilterValue] = useState<TFilter | null>(null)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timeout)
  }, [search])

  return {
    page,
    setPage,
    search,
    setSearch: setSearchValue,
    filter,
    setFilter: (value: TFilter | null) => {
      setFilterValue(value)
      setPage(1)
    },
    query: { page, search: debouncedSearch || undefined },
  }
}
