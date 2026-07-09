export function SearchBar({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  return (
    <div className="search-field">
      <label htmlFor="example-search">노출 예제 검색</label>
      <input
        id="example-search"
        onChange={(event) => onChange(event.target.value)}
        placeholder="제목, 설명, 변형 검색"
        type="search"
        value={value}
      />
    </div>
  );
}
