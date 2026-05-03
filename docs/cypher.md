# The Complete Cypher Cheat Sheet

## Table of Contents

1. [MATCH](#1-match)
2. [OPTIONAL MATCH](#2-optional-match)
3. [WHERE](#3-where)
4. [WITH](#4-with)
5. [Creating](#5-creating)
6. [Updating](#6-updating)
7. [Deleting](#7-deleting)
8. [CALL](#8-call)
9. [LOAD CSV](#9-load-csv)
10. [Indexes](#10-indexes)
11. [Constraints](#11-constraints)
12. [Graph Algorithms](#12-graph-algorithms)
13. [NetworkX](#13-networkx)
14. [Other Useful Cypher Queries](#14-other-useful-cypher-queries)

---

Cypher is the most widely adopted, fully specified, and open query language for
property graph databases. It provides an intuitive and fast way to work with
property graphs.

This article contains some of the most useful and common Cypher queries and
their explanations. Whenever you are not sure how to write a Cypher query, you
can take a look at this cheat sheet and try again. If you are new to graph
databases and Cypher, you can also use this post to get acquainted with some of
the features that Cypher and Memgraph offer.

## 1. MATCH

### Find nodes with specific properties

```cypher
MATCH (c:City {name: "London"})
RETURN c.population_size;
```

- `MATCH (c:City {name: "London"})`: the MATCH clause specifies a node pattern
  with the label `City`, filters the matched results to those with a `name`
  property with value London and assigns the matches to variable c.
- `RETURN c.population_size`: the RETURN clause is used to request specific
  results.

### Find nodes with specific relationships

```cypher
MATCH (city:City {name: "London"})-[:IN]-(country:Country)
RETURN country.name;
```

- `MATCH (city:City {name: "London"})-[:IN]-(country:Country)`: the `MATCH`
  clause specifies a node and relationship pattern with two connected nodes,
  labeled `City` and `Country`, connected by a relationship of type `IN`.

### Match labels

```cypher
MATCH (c:City)
RETURN c;
```

- `MATCH (c:City)`: the MATCH clause specifies a node labeled `City`

### Match multiple labels

```cypher
MATCH (c:City:Country)
RETURN c;
```

- `MATCH (c:City:Country)`: the MATCH clause specifies a node labeled both
  `City` and `Country`

## 2. OPTIONAL MATCH

The `MATCH` clause can be modified by prepending the `OPTIONAL` keyword.
`OPTIONAL MATCH` clause behaves the same as a regular `MATCH`, but when it fails
to find the pattern, missing parts of the pattern will be filled with null
values.

### Get optional relationships

```cypher
MATCH (c1:Country {name: 'France'})
OPTIONAL MATCH (c1)--(c2:Country {name: 'Germany'})
RETURN c2;
```

Using `OPTIONAL MATCH` when returning a relationship that doesn't exist will
return the default value `NULL` instead.

The returned property of an optional element that is `NULL` will also be `NULL`

### Optional typed and named relationships

The `OPTIONAL MATCH` clause allows you to use the same conventions as `MATCH`
when it comes to handling variables and relationship types

```cypher
MATCH (c:Country {name: 'United Kingdom'})
OPTIONAL MATCH (c)-[r:LIVES_IN]->()
RETURN c.name, r;
```

## 3. WHERE

Specifying properties can also be done with the `WHERE` clause. Let's rewrite
some of the previously mentioned queries.

### Find nodes with specific properties

```cypher
MATCH (c:City)
WHERE c.name = "London"
RETURN c.population_size;
```

### Find nodes with specific relationships

```cypher
MATCH (city:City)-[:IN]-(country:Country)
WHERE city.name = "London"
RETURN country.name;
```

### Match multiple labels

```cypher
MATCH (c)
WHERE c:City AND c:Country
RETURN c;
```

### Matching nodes with properties in a range

```cypher
MATCH (c:City)
WHERE c.population_size >= 1000000 AND c.population_size <= 2000000
RETURN c;
```

## 4. WITH

The `WITH` clause is used to chain together parts of a query, piping the results
from one to be used as a starting point of criteria in the next query.

### Filter on aggregate functions

Aggregated results have to pass through a `WITH` clause if you want to filter
them:

```cypher
MATCH (p:Person {name: 'John'})--(person)-->()
WITH person, count(*) AS foaf
WHERE foaf > 1
RETURN person.name;
```

Sorting unique aggregated results can be done with `DISTINCT` operator in the
aggregation function which can be then filtered:

```cypher
MATCH (p:Person {name: 'John'})--(person)-->(m)
WITH person, count(DISTINCT m) AS foaf
WHERE foaf > 1
RETURN person.name;
```

### Sorting results

The `WITH` clause can be used to order results before using `collect()` on them:

```cypher
MATCH (n)
WITH n
ORDER BY n.name ASC LIMIT 3
RETURN collect(n.name);
```

If you want to `collect()` only unique values:

```cypher
MATCH (n)
WITH n
ORDER BY n.name ASC LIMIT 3
RETURN collect(DISTINCT n.name) as unique_names;
```

### Limited path searches

The `WITH` clause can be used to match paths, limit to a certain number, and
then match again using those paths as a base:

```cypher
MATCH (p1 {name: 'John'})--(p2)
WITH p2
ORDER BY p2.name ASC LIMIT 1
MATCH (p2)--(p3)
RETURN p3.name;
```

## 5. Creating

### Create a node

```cypher
CREATE (c:City {name: "Zagreb", population_size: 1000000});
```

- `c:City`: creates a new node with the label `City` and assigns it to variable
  `c` (which can be omitted if it's not needed).
- `{name: "Zagreb", population_size: 1000000}`: the newly created node has two
  properties, one with a string value and another with an integer value.

### Create nodes with relationships

```cypher
CREATE (c1:City {name: "UK"}),
	 (c2:City {name: "London",population_size: 9000000}),
	  (c1)<-[r:IN]-(c2)
RETURN c1, c2, r;
```

The `CREATE` clause creates two new nodes and a directed relationship between
them.

### Create a relationship between existing nodes

```cypher
MATCH (c1), (c2)
WHERE c1.name = "UK" AND c2.name = "London"
CREATE (c2)-[:IN]->(c1);
```

This will create a directed relationship of type `IN` between two existing
nodes. If such a relationship already exists, this query will result in a
duplicate. To avoid this, you can use the `MERGE` clause:

```cypher
MATCH (c1), (c2)
WHERE c1.name = "UK" AND c2.name = "London"
MERGE (c2)-[:IN]->(c1);
```

## 6. Updating

### Add or update node properties

```cypher
MATCH (c:Country {name: "UK"})
SET c.name = "United Kingdom";
```

If you use the `SET` clause on a property that doesn't exist, it will be
created.

### Replace all node properties

```cypher
MATCH (c:Country)
WHERE c.name = "United Kingdom"
SET c = {name: "UK", population_size: "66650000"};
```

- `SET c = {name: "UK" ...}`: this `SET` clause will delete all existing
  properties and create the newly specified ones.

### Update multiple node properties

```cypher
MATCH (c:Country)
WHERE c.name = "United Kingdom"
SET c += {name: "UK", population_size: "66650000"};
```

- `SET c += {name: "UK" ...}`: this `SET` clause will add new properties and
  update existing ones if they are already set.

### Check if a property exists and update it

```cypher
MATCH (c:Country)
WHERE c.name = "Germany" AND c.language IS NULL
SET c.language = "German";
```

Because the `WHERE` clause contains the statement `c.language IS NULL`, the node
will only be matched if it doesn't have a `language` property.

### Rename a property

```cypher
MATCH (c:Country)
WHERE c.official_language IS NULL
SET c.official_language = c.language
REMOVE c.language;
```

- `WHERE c.official_language IS NULL`: the `WHERE` clause makes sure that you
  only create the new property in nodes that don't have a property with the same
  name.
- `SET n.official_language = n.language`: you are technically not renaming a
  property but rather creating a new one with a different name and the same
  value.
- `REMOVE n.language`: the `REMOVE` clause is used to delete the old property.

## 7. Deleting

### Delete a node

```cypher
MATCH (c)-[r]-()
WHERE c.name = "US"
DELETE r, c;
```

- `DELETE r, c`: before you can delete a node, all of its relationships must be
  deleted first.

This query can be rewritten with the `DETACH` clause to achieve the same result.

```cypher
MATCH (c)
WHERE c.name = "US"
DETACH DELETE c;
```

### Delete a property

```cypher
MATCH (c:Country)
WHERE c.name = "US" AND c.language IS NOT NULL
REMOVE c.language;
```

This query will delete the property `language` from a specific node.

### Delete label in every node

```cypher
MATCH (c)
REMOVE c:Country;
```

This query will delete the label `Country` from every node.

### Delete one of multiple labels

```cypher
MATCH (c)
WHERE c:Country:City
REMOVE c:City;
```

This will delete the label `City` from every node that has the labels `Country`
and `City`.

### Delete all nodes and relationships

```cypher
MATCH (n)
DETACH DELETE n;
```

This query will delete the whole database.

## 8. CALL

### Cartesian product

`CALL` subquery is executed once for each incoming row. If multiple rows are
produced from the `CALL` subquery, the result is a Cartesian product of results.
It is an output combined from 2 branches, one being called the `input branch`
(rows produced before calling the subquery), and the `subquery branch` (rows
produced by the subquery). Imagine the data includes two `:Person nodes`, one
named `John` and one named `Alice`, as well as two `:Animal` nodes, one named
`Rex` and one named `Lassie`.

Running the following query would produce the output below:

```cypher
MATCH (p:Person)
CALL {
  MATCH (a:Animal)
  RETURN a.name as animal_name
}
RETURN p.name as person_name, animal_name
```

Output:

| person_name | animal_name |
| --- | --- |
| 'John' | 'Rex' |
| 'John' | 'Lassie' |
| 'Alice' | 'Rex' |
| 'Alice' | 'Lassie' |

### Cartesian products with bounded symbols

To reference variables from the outer scope in the subquery, start the subquery
with the `WITH` clause. It allows using the same symbols to expand on the
neighborhood of the referenced nodes or relationships. Otherwise, the subquery
will behave as it sees the variable for the first time. In the following query,
the WITH clause expanded the meaning of the variable person to the node with the
label `:Person` matched in the outer scope of the subquery:

```cypher
MATCH (person:Person)
CALL {
  WITH person
  MATCH (person)-[:HAS_PARENT]->(parent:Parent)
  RETURN parent
}
RETURN person.name, parent.name
```

Output:

| person_name | parent_name |
| --- | --- |
| 'John' | 'John Sr.' |
| 'John' | 'Anna' |
| 'Alice' | 'Roxanne' |
| 'Alice' | 'Bill' |

## 9. LOAD CSV

The `LOAD CSV` clause enables you to load and use data from a `CSV` file of your
choosing in a row-based manner within a query. We support the Excel CSV dialect,
as it's the most commonly used one.

The syntax of the clause is:

```cypher
LOAD CSV FROM <csv-location>
( WITH | NO ) HEADER
[IGNORE BAD]
[DELIMITER <delimiter-string>]
[QUOTE <quote-string>]
[NULLIF <nullif-string>]
AS <variable-name>
```

Below is an example of a query using the `LOAD CSV` clause:

```cypher
LOAD CSV FROM "/people.csv" WITH HEADER AS row
CREATE (p:People) SET p += row;
```

For a more detailed explanation of the syntax and usage example, visit our
[documentation](https://memgraph.com/docs/data-migration/csv).

## 10. INDEXES

Indexes are not created automatically.

You can explicitly create indexes on a data with a specific label or
label-property combination using the `CREATE INDEX ON` syntax.

### Create a label index

To optimize queries that fetch nodes by label, you need to create a label index:

```cypher
CREATE INDEX ON :Person;
```

Creating an index will optimize the following type of queries:

```cypher
MATCH (n:Person) RETURN n;
```

### Create a label-property index

To optimize queries that fetch nodes with a certain label and property
combination, you need to create a label-property index. For the best
performance, create indexes on properties containing unique integer values.

For example, to index nodes that are labeled as `:Person` and have a property
named `age`:

```cypher
CREATE INDEX ON :Person(age);
```

Creating an index will optimize the queries that need to match a specific label
and property combination:

```cypher
MATCH (n :Person {age: 42}) RETURN n;
```

The index will also optimize queries that filter labels and properties with the
`WHERE` clause:

```cypher
MATCH (n) WHERE n:Person AND n.age = 42 RETURN n;
```

Be aware that since the filter inside `WHERE` can contain any kind of an
expression, the expression can be so complicated that the index doesn't get
used. If there is any suspicion that an index isn't used, we recommend writing
labels and properties inside the `MATCH` pattern.

### Check indexes

To check all the labels and label-property pairs that Memgraph currently
indexes, use the following query:

```cypher
SHOW INDEX INFO;
```

The query displays a table of all label and label-property indexes presently
kept by Memgraph, ordered by index type, label, property and count.

### Delete an index

Created indexes can be deleted using the following syntax:

```cypher
DROP INDEX ON :Label;
```

```cypher
DROP INDEX ON :Label(property);
```

These queries instruct all active transactions to abort as soon as possible.
Once all transactions have finished, the index will be deleted.

## 11. Constraints

### Create a uniqueness constraint

```cypher
CREATE CONSTRAINT ON (c:City) ASSERT c.location IS UNIQUE;
```

This query will make sure that every node with the label `City` has a unique
value for the `location` property.

### Create an existence constraint

```cypher
CREATE CONSTRAINT ON (c:City) ASSERT exists(c.name);
```

This query will make sure that every node with the label `City` has the property
`name`.

### Check constraints

```cypher
SHOW CONSTRAINT INFO;
```

This query will list all active constraints in the database.

### Drop a uniqueness constraint

```cypher
DROP CONSTRAINT ON (c:City) ASSERT c.location IS UNIQUE;
```

This query will remove the specified uniqueness constraint.

### Drop an existence constraint

```cypher
DROP CONSTRAINT ON (c:City) ASSERT exists(c.name);
```

This query will remove the specified existence constraint.

## 12. Graph Algorithms

To find out more about the built-in algorithms in Memgraph, take a look at the
[built-in graph
algorithms](https://docs.memgraph.com/memgraph/reference-guide/graph-algorithms).

### Breadth-First Search

```cypher
MATCH (c1:City {name: "London"})
      -[edge_list:ROAD_TO *bfs..10]-
      (c2:City {name: "Paris"})
RETURN *;
```

This query will find the shortest path of length up to 10 between nodes `c1` and
`c2`.

### Weighted Shortest Path

```cypher
MATCH (c1:City {name: "London"})
      -[edge_list:ROAD_TO *wShortest
        (e, n | e.weight) total_weight = 10]-
      (c2:City {name: "Paris"})
RETURN *;
```

The above query will find the shortest path of length up to 10 nodes between
nodes `c1` and `c2`. The length restriction parameter is optional.

## 13. NetworkX

If you want to know which NetworkX algorithms are available in Memgraph, take a
look at the [reference
guide](https://memgraph.com/docs/advanced-algorithms/utilize-networkx)

### Analyze the whole graph

```cypher
CALL graph_analyzer.analyze() WITH YIELD *;
```

This query will return various information like the number of nodes, number of
edges, average degree, etc.

### Find weakly connected components (Union Find)

```cypher
MATCH (n)-[e]->()
WITH collect(n) AS nodes, collect(e) AS edges
CALL wcc.get_components(nodes, edges)
YIELD *
RETURN n_components, components;
```

This query will search the whole graph for weakly connected components.

### Calculate PageRank for all nodes

```cypher
CALL nxalg.pagerank()
YIELD *
RETURN node.name AS name, rank
ORDER BY rank DESC
LIMIT 10;
```

This query will calculate the rank of every node, order them from highest to
lowest and return the first 10 results.

## 14. Other Useful Cypher Queries

### Count all nodes

```cypher
MATCH (n)
RETURN count(n);
```

This query will return the number of nodes in the database.

### Count all relationships

```cypher
MATCH ()-->()
RETURN count(*);
```

This query will return the number of relationships in the database.

### Limit the number of returned results

```cypher
MATCH (c:City)
RETURN c
LIMIT 5;
```

`LIMIT 5`: this will limit the number of returned nodes to 5.

### Specify an alias for results

```cypher
MATCH (c:Country)
WHERE c.name = "US"
RETURN c.population_size AS population
```

By using `AS` with the `RETURN` clause, the property `population_size` will be
returned with an alias.

## Conclusion

Cypher is an extensive query language with lots of features, and this cheat
sheet is a great starting point for mastering them. If you are new to Cypher, we
suggest taking our ten-day [Cypher
email](https://memgraph.com/learn-cypher-query-language) course. You can also go
through our Cypher lessons on [Memgraph
Playground](https://playground.memgraph.com/lesson/game-of-thrones-deaths-introductions-2-cypher?step=intro),
an online platform for running Cypher queries on live data.

If you have any questions about Cypher that aren't covered in this article,
please take a look at our [Cypher
manual](https://docs.memgraph.com/cypher-manual/). Feel free also to share your
questions on our [Discord server](https://discord.gg/memgraph).
